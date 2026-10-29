import { BadRequestException, Injectable } from '@nestjs/common'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource, EntityManager, In, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import type * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'
import { SRM_USER_RESOLVE_LIMIT, SRM_WALLET_BALANCE_FIELD, srmWalletRedisKey } from '@/modules/srm/user/user.constants'

/** 供应商钱包：创建和查询。创建后按字段写入 Redis 哈希，余额用 HINCRBY 原子扣减。 */
@Injectable()
export class SrmUserService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService
    ) {}

    /** 为新建供应商创建钱包。已有钱包不重置余额，创建或确认后刷新 Redis。 */
    public async create(input: FeignSchema.FinanceCreateSrmUserWalletRequest): Promise<FeignSchema.FinanceSrmUserWallet> {
        const wallet = this.normalizeCreate(input)
        await this.dataSource.transaction(async manager => this.insertWallet(manager, wallet))
        return this.cacheSaved(wallet.userKeyId)
    }

    /** 按供应商主键批量查询钱包；没有钱包时币种为 null、金额为 0。 */
    public async findColumnResolver(userKeyIds: number[]): Promise<FeignSchema.FinanceSrmUserSummary[]> {
        const keyIds = [...new Set(userKeyIds)].filter(keyId => Number.isInteger(keyId) && keyId > 0)
        if (keyIds.length === 0) return []
        if (keyIds.length > SRM_USER_RESOLVE_LIMIT) {
            throw new BadRequestException(`单次最多查询${SRM_USER_RESOLVE_LIMIT}个供应商钱包`)
        }
        const wallets = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).find({
            where: { userKeyId: In(keyIds) },
            select: { userKeyId: true, currency: true, balance: true, credit: true }
        })
        const byUser = new Map(wallets.map(wallet => [wallet.userKeyId, wallet]))
        return keyIds.map(userKeyId => {
            const wallet = byUser.get(userKeyId)
            return {
                userKeyId,
                currency: wallet?.currency ?? null,
                balance: wallet?.balance ?? 0,
                credit: wallet?.credit ?? 0
            }
        })
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

    private async cacheSaved(userKeyId: number): Promise<FeignSchema.FinanceSrmUserWallet> {
        const saved = await this.dataSource.getRepository(Schema.TbFinanceSrmUserWallet).findOneOrFail({ where: { userKeyId } })
        const snapshot = this.toSnapshot(saved)
        await this.redisService.hMSet(srmWalletRedisKey(saved.userKeyId), {
            currency: snapshot.currency,
            payMode: snapshot.payMode,
            [SRM_WALLET_BALANCE_FIELD]: snapshot.balance,
            credit: snapshot.credit
        })
        return snapshot
    }

    private toSnapshot(wallet: Schema.TbFinanceSrmUserWallet): FeignSchema.FinanceSrmUserWallet {
        return {
            userKeyId: wallet.userKeyId,
            currency: wallet.currency,
            payMode: wallet.payMode,
            balance: wallet.balance,
            credit: wallet.credit
        }
    }

    private normalizeCreate(input: FeignSchema.FinanceCreateSrmUserWalletRequest) {
        const userKeyId = Number(input?.userKeyId)
        const currency = typeof input?.currency === 'string' ? input.currency.trim() : ''
        const payMode = Object.values(Schema.TbFinanceSrmUserWalletPayMode).find(mode => mode === input?.payMode)
        const credit = input?.credit === undefined || input.credit === null ? 0 : Number(input.credit)
        if (!Number.isInteger(userKeyId) || userKeyId <= 0) throw new BadRequestException('供应商主键必须大于0')
        if (!currency || currency.length > 16) throw new BadRequestException('财务币种编码必填且不能超过16位')
        if (!payMode) throw new BadRequestException('付款模式格式错误')
        if (!Number.isSafeInteger(credit) || credit < 0) throw new BadRequestException('信用额度必须是大于等于0的整数')
        return { userKeyId, currency, payMode, balance: 0, credit }
    }
}
