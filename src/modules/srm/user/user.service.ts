import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { DataSource, EntityManager, InjectDataSource, MoreThan } from '@wlisfes/chat-web-base-schema/database'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import * as constants from '@/modules/srm/user/user.constants'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 供应商钱包：创建、查询和余额回写。启动时为现有钱包补齐 Redis 哈希，余额用 HINCRBY 原子扣减，定时任务把 Redis 余额同步回钱包表。 */
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

    /** 一次读取总余额哈希，再按包大小写回钱包表。不再按账户查询 Redis。 */
    public async syncWalletBalance(): Promise<feign.FinanceSrmUserWalletSyncResponse> {
        const result: feign.FinanceSrmUserWalletSyncResponse = { total: 0, updated: 0, unchanged: 0, restored: 0, invalidUserKeyIds: [] }
        const snapshot = await this.redisService.hGetAll(constants.SRM_WALLET_BALANCE_KEY)
        const changes = Object.entries(snapshot).flatMap(([field, raw]) => {
            const userKeyId = Number(field)
            if (!Number.isInteger(userKeyId) || userKeyId <= 0) return []
            result.total += 1
            try {
                return [{ userKeyId, balance: this.parseRedisAmount(userKeyId, '余额', raw) }]
            } catch (error) {
                this.logger.warn(`供应商钱包余额同步跳过：${error instanceof Error ? error.message : String(error)}`)
                result.invalidUserKeyIds.push(userKeyId)
                return []
            }
        })
        await this.writeBalances(changes)
        result.updated = changes.length
        return result
    }

    /** 分批读取所有钱包，只给 Redis 中还没有缓存的钱包写入余额和信用额度。 */
    private async syncExistingWalletCache(): Promise<void> {
        try {
            let lastKeyId = 0
            let created = 0
            for (;;) {
                const wallets = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).find({
                    where: { keyId: MoreThan(lastKeyId) },
                    select: { keyId: true, userKeyId: true, balance: true, credit: true },
                    order: { keyId: 'ASC' },
                    take: constants.SRM_WALLET_CACHE_BATCH_SIZE
                })
                if (wallets.length === 0) break
                const existing = await this.redisService.hGetAll(constants.SRM_WALLET_BALANCE_KEY)
                const missing = wallets.filter(wallet => existing[String(wallet.userKeyId)] === undefined)
                if (missing.length > 0) {
                    await this.redisService.hMSet(
                        constants.SRM_WALLET_BALANCE_KEY,
                        Object.fromEntries(missing.map(wallet => [String(wallet.userKeyId), wallet.balance]))
                    )
                    await this.redisService.hMSet(
                        constants.SRM_WALLET_CREDIT_KEY,
                        Object.fromEntries(missing.map(wallet => [String(wallet.userKeyId), wallet.credit]))
                    )
                    created += missing.length
                }
                lastKeyId = wallets[wallets.length - 1].keyId
            }
            this.logger.log(`供应商钱包 Redis 缓存已补齐：新增=${created}`)
        } catch (error) {
            this.logger.warn(
                `供应商钱包 Redis 缓存补齐失败，${constants.SRM_WALLET_CACHE_RETRY_MS}ms 后重试：${error instanceof Error ? error.message : String(error)}`
            )
            this.retryTimer = setTimeout(() => void this.syncExistingWalletCache(), constants.SRM_WALLET_CACHE_RETRY_MS)
        }
    }

    /** 按包大小写回 Redis 余额，避免一条 SQL 超过 max_allowed_packet。 */
    private async writeBalances(changes: Array<{ userKeyId: number; balance: number }>): Promise<void> {
        for (let offset = 0; offset < changes.length; offset += constants.SRM_WALLET_SQL_BATCH_SIZE) {
            const batch = changes.slice(offset, offset + constants.SRM_WALLET_SQL_BATCH_SIZE)
            const when = batch.map(() => 'WHEN ? THEN ?').join(' ')
            const ids = batch.map(() => '?').join(',')
            await this.dataSource.query(
                `UPDATE \`tb_finance_srm_user_wallet\` SET \`balance\` = CASE \`user_key_id\` ${when} ELSE \`balance\` END WHERE \`user_key_id\` IN (${ids})`,
                [...batch.flatMap(item => [item.userKeyId, item.balance]), ...batch.map(item => item.userKeyId)]
            )
        }
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
