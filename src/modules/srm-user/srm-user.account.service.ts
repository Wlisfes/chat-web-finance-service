import { Injectable, Logger } from '@nestjs/common'
import { DataSource, EntityManager, In, InjectDataSource } from '@wlisfes/chat-web-base-schema/database'
import { type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import type * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 单次批量查询供应商账户的数量上限，与其他 Feign 批量接口一致。 */
export const SRM_USER_RESOLVE_LIMIT = 100

/** 落账结果：applied=本次写入流水并扣减余额，duplicate=已落账过（重复投递），invalid=事件不完整，不落账。 */
export type SrmUserBillingResult = 'applied' | 'duplicate' | 'invalid'

/**
 * 供应商账户与计费流水：Finance 是供应商余额的权威来源。
 *
 * - 一条短信只计费一次：流水表 eventId、msgId 唯一，重复事件直接跳过；
 * - 流水写入和余额扣减在同一事务中完成，余额按 SQL 原子增减，多个实例并发落账也不会丢失更新；
 * - 预付、后付共用同一余额，扣成负数分别表示欠费、应付；账户不存在时按事件的付款模式自动创建。
 */
@Injectable()
export class SrmUserAccountService {
    private readonly logger = new Logger(SrmUserAccountService.name)

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    /** 校验并落账一条供应商计费事件。 */
    public async apply(billing: Partial<SrmUserBillingPayload> | undefined): Promise<SrmUserBillingResult> {
        const event = this.normalize(billing)
        if (!event) return 'invalid'
        return this.dataSource.transaction(async manager => {
            const exists = await manager.getRepository(Schema.TbFinanceSrmUserBill).exists({
                where: [{ eventId: event.eventId }, { msgId: event.msgId }]
            })
            if (exists) return 'duplicate'
            await this.ensureAccount(manager, event.userKeyId, event.payMode)
            await manager
                .createQueryBuilder()
                .update(Schema.TbFinanceSrmUser)
                .set({
                    balanceUsd: () => `${Schema.TbFinanceSrmUserColumn.BALANCE_USD} - ${event.costUsd}`,
                    billedUsd: () => `${Schema.TbFinanceSrmUserColumn.BILLED_USD} + ${event.costUsd}`,
                    billCount: () => `${Schema.TbFinanceSrmUserColumn.BILL_COUNT} + 1`,
                    payMode: event.payMode
                })
                .where('userKeyId = :userKeyId', { userKeyId: event.userKeyId })
                .execute()
            const account = await manager
                .getRepository(Schema.TbFinanceSrmUser)
                .findOneOrFail({ where: { userKeyId: event.userKeyId }, select: { keyId: true, balanceUsd: true } })
            await manager.getRepository(Schema.TbFinanceSrmUserBill).insert({
                eventId: event.eventId,
                msgId: event.msgId,
                userKeyId: event.userKeyId,
                simbankKeyId: event.simbankKeyId,
                portKeyId: event.portKeyId,
                payMode: event.payMode,
                trigger: event.trigger,
                segments: event.segments,
                costUsd: event.costUsd,
                balanceUsd: account.balanceUsd,
                occurredTime: event.occurredTime
            })
            return 'applied'
        })
    }

    /** 按供应商主键批量查询余额；没有账户的供应商返回 0 余额，供 SRM 页面展示。 */
    public async findColumnResolver(userKeyIds: number[]): Promise<FeignSchema.FinanceSrmUserSummary[]> {
        const keyIds = [...new Set(userKeyIds)].filter(keyId => Number.isInteger(keyId) && keyId > 0)
        if (keyIds.length === 0) return []
        if (keyIds.length > SRM_USER_RESOLVE_LIMIT) {
            throw new Error(`单次最多查询${SRM_USER_RESOLVE_LIMIT}个供应商账户`)
        }
        const accounts = await this.dataSource.getRepository(Schema.TbFinanceSrmUser).find({
            where: { userKeyId: In(keyIds) },
            select: { userKeyId: true, balanceUsd: true, billedUsd: true, billCount: true }
        })
        const byUser = new Map(accounts.map(account => [account.userKeyId, account]))
        return keyIds.map(userKeyId => {
            const account = byUser.get(userKeyId)
            return {
                userKeyId,
                balanceUsd: account?.balanceUsd ?? 0,
                billedUsd: account?.billedUsd ?? 0,
                billCount: account?.billCount ?? 0
            }
        })
    }

    /** 账户不存在时创建；并发创建由唯一索引兜底，冲突时忽略。 */
    private async ensureAccount(manager: EntityManager, userKeyId: number, payMode: Schema.TbFinanceSrmUserPayMode): Promise<void> {
        await manager
            .createQueryBuilder()
            .insert()
            .into(Schema.TbFinanceSrmUser)
            .values({ userKeyId, payMode, balanceUsd: 0, billedUsd: 0, billCount: 0 })
            .orIgnore()
            .updateEntity(false)
            .execute()
    }

    private normalize(billing: Partial<SrmUserBillingPayload> | undefined) {
        const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
        const positive = (value: unknown) => {
            const number = Number(value)
            return Number.isInteger(number) && number > 0 ? number : 0
        }
        const eventId = text(billing?.eventId)
        const msgId = text(billing?.msgId)
        const userKeyId = positive(billing?.userKeyId)
        const payMode = Object.values(Schema.TbFinanceSrmUserPayMode).find(mode => mode === billing?.payMode)
        const trigger = Object.values(Schema.TbFinanceSrmUserBillTrigger).find(value => value === billing?.trigger)
        const costUsd = Number(billing?.costUsd)
        const occurredTime = new Date(text(billing?.occurredTime))
        if (!eventId || !msgId || !userKeyId || !payMode || !trigger || !Number.isSafeInteger(costUsd) || costUsd < 0) {
            this.logger.warn(`供应商计费事件不完整，不落账：${JSON.stringify(billing)}`)
            return undefined
        }
        return {
            eventId,
            msgId,
            userKeyId,
            simbankKeyId: positive(billing?.simbankKeyId),
            portKeyId: positive(billing?.portKeyId),
            payMode,
            trigger,
            segments: positive(billing?.segments) || 1,
            costUsd,
            occurredTime: Number.isNaN(occurredTime.getTime()) ? new Date() : occurredTime
        }
    }
}
