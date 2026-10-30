import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { DataSource, EntityManager, InjectDataSource, MoreThan } from '@wlisfes/chat-web-base-schema/database'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import * as constants from '@/modules/srm/user/user.constants'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 供应商钱包：创建、查询和余额回写。启动时核对 Redis 哈希，扣费只标记变化账户，定时任务按标记增量回写钱包表。 */
@Injectable()
export class SrmUserService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SrmUserService.name)
    private retryTimer?: NodeJS.Timeout

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService
    ) {}

    /** 启动后为现有供应商钱包补齐 Redis 缓存；Redis 未就绪时稍后重试，不阻塞服务启动。 */
    public async onApplicationBootstrap(): Promise<void> {
        await this.syncExistingWalletCache()
    }

    public onApplicationShutdown(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer)
    }

    /** 为新建供应商创建钱包。已有钱包不重置余额，创建或确认后刷新 Redis。 */
    public async create(input: feign.FinanceCreateSrmUserWalletRequest): Promise<feign.FinanceSrmUserWallet> {
        const wallet = this.normalizeCreate(input)
        await this.dataSource.transaction(async manager => this.insertWallet(manager, wallet))
        return this.cacheSaved(wallet.userKeyId)
    }

    /** 按供应商主键批量查询钱包金额；余额和信用额度只取 Redis 最新值，没有钱包时金额为 0。 */
    public async findColumnResolver(userKeyIds: number[]): Promise<feign.FinanceSrmUserSummary[]> {
        const keyIds = [...new Set(userKeyIds)].filter(keyId => Number.isInteger(keyId) && keyId > 0)
        if (keyIds.length === 0) return []
        if (keyIds.length > constants.SRM_USER_RESOLVE_LIMIT) {
            throw new BadRequestException(`单次最多查询${constants.SRM_USER_RESOLVE_LIMIT}个供应商钱包`)
        }
        const fields = keyIds.map(String)
        const [balances, credits] = await Promise.all([
            this.redisService.hMGet(constants.SRM_WALLET_BALANCE_KEY, fields),
            this.redisService.hMGet(constants.SRM_WALLET_CREDIT_KEY, fields)
        ])
        return keyIds.map((userKeyId, index) => ({
            userKeyId,
            balance: this.readAmount(userKeyId, '余额', balances[index]),
            credit: this.readAmount(userKeyId, '信用额度', credits[index])
        }))
    }

    /** 字段不存在时金额为 0；存在但格式错误时拒绝返回。 */
    private readAmount(userKeyId: number, name: string, raw: string | null): number {
        if (raw === null) return 0
        return this.parseRedisAmount(userKeyId, name, raw)
    }
    /** 将 Redis 哈希中的金额转换为安全整数。 */
    private parseRedisAmount(userKeyId: number, name: string, raw: string): number {
        if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) {
            throw new Error(`供应商钱包${userKeyId}的 Redis ${name}缺失或格式错误`)
        }
        const amount = Number(raw)
        if (!Number.isSafeInteger(amount)) {
            throw new Error(`供应商钱包${userKeyId}的 Redis ${name}超出安全整数范围`)
        }
        return amount
    }

    /** 钱包不存在时创建；并发创建由唯一索引兜底。 */
    private async insertWallet(
        manager: EntityManager,
        wallet: Pick<Schema.TbFinanceSrmUserWallet, 'userKeyId' | 'payMode' | 'currency' | 'balance' | 'credit'>
    ): Promise<void> {
        await manager
            .createQueryBuilder()
            .insert()
            .into(Schema.TbFinanceSrmUserWallet)
            .values(wallet)
            .orIgnore()
            .updateEntity(false)
            .execute()
    }

    /** 只扫描余额变化标记并分批回写；无变化时不读取全量余额哈希。 */
    public async syncWalletBalance(): Promise<feign.FinanceSrmUserWalletSyncResponse> {
        const result: feign.FinanceSrmUserWalletSyncResponse = { total: 0, updated: 0, unchanged: 0, restored: 0, invalidUserKeyIds: [] }
        const dirtyKeys = await this.redisService.scan(`${constants.SRM_WALLET_BALANCE_DIRTY_PREFIX}:*`)
        for (const keys of this.chunk(dirtyKeys, constants.SRM_WALLET_SQL_BATCH_SIZE)) {
            let claimed: Array<{ userKeyId: number; key: string }> = []
            try {
                claimed = await this.claimDirtyBalances(keys)
                if (claimed.length === 0) continue
                const values = await this.redisService.hMGet(
                    constants.SRM_WALLET_BALANCE_KEY,
                    claimed.map(item => String(item.userKeyId))
                )
                const changes = claimed.flatMap((item, index) => {
                    const raw = values[index]
                    try {
                        return [{ userKeyId: item.userKeyId, balance: this.parseRedisAmount(item.userKeyId, '余额', raw ?? '') }]
                    } catch (error) {
                        this.logger.warn(`供应商钱包余额同步跳过：${error instanceof Error ? error.message : String(error)}`)
                        result.invalidUserKeyIds.push(item.userKeyId)
                        return []
                    }
                })
                const written = await this.writeBalances(changes)
                result.total += claimed.length
                result.updated += written.updated
                result.unchanged += written.unchanged
            } catch (error) {
                // GETDEL 已认领本批标记；数据库或 Redis 临时失败时补回，下一分钟重试。
                await this.restoreDirtyBalances(claimed.map(item => item.key))
                throw error
            }
        }
        return result
    }

    /** 分批核对全部钱包：Redis 缺失时用数据库初始化，已有余额不一致时直接回写数据库。 */
    private async syncExistingWalletCache(): Promise<void> {
        try {
            let lastKeyId = 0
            let restored = 0
            let corrected = 0
            for (;;) {
                const wallets = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).find({
                    where: { keyId: MoreThan(lastKeyId) },
                    select: { keyId: true, userKeyId: true, balance: true, credit: true },
                    order: { keyId: 'ASC' },
                    take: constants.SRM_WALLET_CACHE_BATCH_SIZE
                })
                if (wallets.length === 0) break
                const fields = wallets.map(wallet => String(wallet.userKeyId))
                const [balances, credits] = await Promise.all([
                    this.redisService.hMGet(constants.SRM_WALLET_BALANCE_KEY, fields),
                    this.redisService.hMGet(constants.SRM_WALLET_CREDIT_KEY, fields)
                ])
                const missingBalances = wallets.filter((_, index) => balances[index] === null)
                const missingCredits = wallets.filter((_, index) => credits[index] === null)
                if (missingBalances.length > 0) {
                    await this.redisService.hMSet(
                        constants.SRM_WALLET_BALANCE_KEY,
                        Object.fromEntries(missingBalances.map(wallet => [String(wallet.userKeyId), wallet.balance]))
                    )
                }
                if (missingCredits.length > 0) {
                    await this.redisService.hMSet(
                        constants.SRM_WALLET_CREDIT_KEY,
                        Object.fromEntries(missingCredits.map(wallet => [String(wallet.userKeyId), wallet.credit]))
                    )
                }
                restored += new Set([...missingBalances, ...missingCredits].map(wallet => wallet.userKeyId)).size
                const changes = wallets.flatMap((wallet, index) => {
                    const raw = balances[index]
                    if (raw === null) return []
                    try {
                        const balance = this.parseRedisAmount(wallet.userKeyId, '余额', raw)
                        return balance === wallet.balance ? [] : [{ userKeyId: wallet.userKeyId, balance }]
                    } catch (error) {
                        this.logger.warn(`供应商钱包启动核对跳过：${error instanceof Error ? error.message : String(error)}`)
                        return []
                    }
                })
                corrected += (await this.writeBalances(changes)).updated
                lastKeyId = wallets[wallets.length - 1].keyId
            }
            this.logger.log(`供应商钱包启动核对完成：补齐 Redis=${restored}，修正数据库=${corrected}`)
        } catch (error) {
            this.logger.warn(
                `供应商钱包启动核对失败，${constants.SRM_WALLET_CACHE_RETRY_MS}ms 后重试：${error instanceof Error ? error.message : String(error)}`
            )
            this.retryTimer = setTimeout(() => void this.syncExistingWalletCache(), constants.SRM_WALLET_CACHE_RETRY_MS)
        }
    }

    /** 按包大小写回 Redis 余额，避免一条 SQL 超过 max_allowed_packet，并返回实际变化数量。 */
    private async writeBalances(changes: Array<{ userKeyId: number; balance: number }>): Promise<{ updated: number; unchanged: number }> {
        let updated = 0
        let unchanged = 0
        for (let offset = 0; offset < changes.length; offset += constants.SRM_WALLET_SQL_BATCH_SIZE) {
            const batch = changes.slice(offset, offset + constants.SRM_WALLET_SQL_BATCH_SIZE)
            const when = batch.map(() => 'WHEN ? THEN ?').join(' ')
            const ids = batch.map(() => '?').join(',')
            const result = await this.dataSource.query(
                `UPDATE \`tb_finance_srm_user_wallet\` SET \`balance\` = CASE \`user_key_id\` ${when} ELSE \`balance\` END WHERE \`user_key_id\` IN (${ids})`,
                [...batch.flatMap(item => [item.userKeyId, item.balance]), ...batch.map(item => item.userKeyId)]
            )
            const affectedRows = this.readAffectedRows(result)
            const changed = affectedRows ?? batch.length
            updated += changed
            unchanged += Math.max(batch.length - changed, 0)
        }
        return { updated, unchanged }
    }

    /** 每批使用 GETDEL 原子认领；之后新到的扣费会重新生成标记，不会被本轮误删。 */
    private async claimDirtyBalances(keys: string[]): Promise<Array<{ userKeyId: number; key: string }>> {
        const candidates = keys.flatMap(key => {
            const userKeyId = this.readDirtyUserKeyId(key)
            return userKeyId === null ? [] : [{ userKeyId, key }]
        })
        // 一批命令同时交给 node-redis 排队发送，避免 1000 次串行网络往返。
        const values = await Promise.all(candidates.map(item => this.redisService.getDel(item.key)))
        return candidates.filter((_, index) => values[index] !== null)
    }

    /** 解析 dirty key 中的供应商主键，忽略扫描结果里的异常 key。 */
    private readDirtyUserKeyId(key: string): number | null {
        const prefix = `${constants.SRM_WALLET_BALANCE_DIRTY_PREFIX}:`
        if (!key.startsWith(prefix)) return null
        const userKeyId = Number(key.slice(prefix.length))
        return Number.isInteger(userKeyId) && userKeyId > 0 ? userKeyId : null
    }

    /** 处理失败时补回固定值标记，不会覆盖处理中产生的新变化。 */
    private async restoreDirtyBalances(keys: string[]): Promise<void> {
        const results = await Promise.allSettled(keys.map(key => this.redisService.set(key, '1')))
        const failed = results.filter(item => item.status === 'rejected').length
        if (failed > 0) this.logger.error(`供应商钱包余额同步失败后补回标记失败：${failed}/${keys.length}`)
    }

    /** 读取 MySQL 批量 UPDATE 的实际影响行数；驱动不返回时由调用方保守按整批计算。 */
    private readAffectedRows(result: unknown): number | null {
        const first = Array.isArray(result) ? result[0] : result
        if (!first || typeof first !== 'object') return null
        const value = (first as { affectedRows?: unknown }).affectedRows
        const affectedRows = Number(value)
        return Number.isInteger(affectedRows) && affectedRows >= 0 ? affectedRows : null
    }

    private chunk<T>(items: T[], size: number): T[][] {
        const chunks: T[][] = []
        for (let offset = 0; offset < items.length; offset += size) chunks.push(items.slice(offset, offset + size))
        return chunks
    }

    /** Redis 已有钱包时保留最新余额；不存在时用数据库余额初始化。 */
    private async cacheIfMissing(wallet: Pick<Schema.TbFinanceSrmUserWallet, 'userKeyId' | 'balance' | 'credit'>): Promise<boolean> {
        const field = String(wallet.userKeyId)
        if ((await this.redisService.hGet(constants.SRM_WALLET_BALANCE_KEY, field)) !== null) return false
        await this.cacheWallet(wallet)
        return true
    }

    private async cacheWallet(wallet: Pick<Schema.TbFinanceSrmUserWallet, 'userKeyId' | 'balance' | 'credit'>): Promise<void> {
        const field = String(wallet.userKeyId)
        await Promise.all([
            this.redisService.hSet(constants.SRM_WALLET_BALANCE_KEY, field, String(wallet.balance)),
            this.redisService.hSet(constants.SRM_WALLET_CREDIT_KEY, field, String(wallet.credit))
        ])
    }

    private async cacheSaved(userKeyId: number): Promise<feign.FinanceSrmUserWallet> {
        const saved = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).findOneOrFail({ where: { userKeyId } })
        await this.cacheIfMissing(saved)
        return this.toSnapshot(saved)
    }

    private toSnapshot(wallet: Schema.TbFinanceSrmUserWallet): feign.FinanceSrmUserWallet {
        return {
            userKeyId: wallet.userKeyId,
            currency: wallet.currency,
            payMode: wallet.payMode,
            balance: wallet.balance,
            credit: wallet.credit
        }
    }

    private normalizeCreate(input: feign.FinanceCreateSrmUserWalletRequest) {
        const userKeyId = Number(input?.userKeyId)
        const currency = typeof input?.currency === 'string' ? input.currency.trim() : ''
        const payMode = Object.values(Schema.TbFinanceSrmUserWalletPayMode).find(mode => mode === input?.payMode)
        const credit = input?.credit === undefined || input.credit === null ? 0 : Number(input.credit)
        if (!Number.isInteger(userKeyId) || userKeyId <= 0) {
            throw new BadRequestException('供应商主键必须大于0')
        }
        if (!currency || currency.length > 16) {
            throw new BadRequestException('财务币种编码必填且不能超过16位')
        }
        if (!payMode) {
            throw new BadRequestException('付款模式格式错误')
        }
        if (!Number.isSafeInteger(credit) || credit < 0) {
            throw new BadRequestException('信用额度必须是大于等于0的整数')
        }
        return { userKeyId, currency, payMode, balance: 0, credit }
    }
}
