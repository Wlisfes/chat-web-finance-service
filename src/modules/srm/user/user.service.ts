import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource, EntityManager, InjectDataSource, MoreThan } from '@wlisfes/chat-web-base-schema/database'
import {
    SRM_USER_RESOLVE_LIMIT,
    SRM_WALLET_BALANCE_FIELD,
    SRM_WALLET_CACHE_BATCH_SIZE,
    SRM_WALLET_CACHE_RETRY_MS,
    srmWalletRedisKey
} from '@/modules/srm/user/user.constants'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 供应商钱包：创建和查询。启动时为现有钱包补齐 Redis 哈希，余额用 HINCRBY 原子扣减。 */
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
        if (keyIds.length > SRM_USER_RESOLVE_LIMIT) {
            throw new BadRequestException(`单次最多查询${SRM_USER_RESOLVE_LIMIT}个供应商钱包`)
        }
        return Promise.all(keyIds.map(async userKeyId => ({ userKeyId, ...(await this.findRedisAmounts(userKeyId)) })))
    }

    /** 从 Redis 读取最新余额和信用额度；钱包哈希不存在时金额为 0，字段格式错误时拒绝返回。 */
    private async findRedisAmounts(userKeyId: number): Promise<Pick<feign.FinanceSrmUserSummary, 'balance' | 'credit'>> {
        const snapshot = await this.redisService.hGetAll(srmWalletRedisKey(userKeyId))
        if (Object.keys(snapshot).length === 0) return { balance: 0, credit: 0 }
        return {
            balance: this.parseRedisAmount(userKeyId, '余额', snapshot[SRM_WALLET_BALANCE_FIELD]),
            credit: this.parseRedisAmount(userKeyId, '信用额度', snapshot.credit)
        }
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
                    take: SRM_WALLET_CACHE_BATCH_SIZE
                })
                if (wallets.length === 0) break
                for (const wallet of wallets) {
                    if (await this.cacheIfMissing(wallet)) created += 1
                }
                lastKeyId = wallets[wallets.length - 1].keyId
            }
            this.logger.log(`供应商钱包 Redis 缓存已补齐：新增=${created}`)
        } catch (error) {
            this.logger.warn(
                `供应商钱包 Redis 缓存补齐失败，${SRM_WALLET_CACHE_RETRY_MS}ms 后重试：${error instanceof Error ? error.message : String(error)}`
            )
            this.retryTimer = setTimeout(() => void this.syncExistingWalletCache(), SRM_WALLET_CACHE_RETRY_MS)
        }
    }

    /** Redis 已有钱包时保留最新余额；不存在时用数据库余额初始化。 */
    private async cacheIfMissing(wallet: Pick<Schema.TbFinanceSrmUserWallet, 'userKeyId' | 'balance' | 'credit'>): Promise<boolean> {
        const key = srmWalletRedisKey(wallet.userKeyId)
        if (Object.keys(await this.redisService.hGetAll(key)).length > 0) return false
        await this.redisService.hMSet(key, { [SRM_WALLET_BALANCE_FIELD]: wallet.balance, credit: wallet.credit })
        return true
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
