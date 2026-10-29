import { BadRequestException, Injectable } from '@nestjs/common'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource, EntityManager, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { SRM_USER_RESOLVE_LIMIT, SRM_WALLET_BALANCE_FIELD, srmWalletRedisKey } from '@/modules/srm/user/user.constants'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 供应商钱包：创建和查询。创建后按字段写入 Redis 哈希，余额用 HINCRBY 原子扣减。 */
@Injectable()
export class SrmUserService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService
    ) {}

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

    private async cacheSaved(userKeyId: number): Promise<feign.FinanceSrmUserWallet> {
        const saved = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).findOneOrFail({ where: { userKeyId } })
        const snapshot = this.toSnapshot(saved)
        await this.redisService.hMSet(srmWalletRedisKey(saved.userKeyId), {
            [SRM_WALLET_BALANCE_FIELD]: snapshot.balance,
            credit: snapshot.credit
        })
        return snapshot
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
