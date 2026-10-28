import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { RabbitmqService, SMS_SRM_USER_BILLING_QUEUE, type SrmUserBillingPayload } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { SrmUserAccountService } from '@/modules/srm-user/srm-user.account.service'

/**
 * 消费 Dispatch 发布的供应商计费事件并落账。
 * 重复事件直接确认；不完整的事件拒绝进入死信，供人工排查；落账出错时抛错，同样进入死信，避免反复重试阻塞队列。
 */
@Injectable()
export class SrmUserBillingConsumer implements OnApplicationBootstrap {
    private readonly logger = new Logger(SrmUserBillingConsumer.name)

    constructor(
        private readonly rabbitmqService: RabbitmqService,
        private readonly accountService: SrmUserAccountService
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        await this.rabbitmqService.consume<SrmUserBillingPayload>(SMS_SRM_USER_BILLING_QUEUE, async billing =>
            this.fetchSrmUserBilling(billing)
        )
    }

    private async fetchSrmUserBilling(billing: SrmUserBillingPayload): Promise<'ack' | 'reject'> {
        const result = await this.accountService.apply(billing)
        const summary = `eventId=${billing?.eventId}，userKeyId=${billing?.userKeyId}，payMode=${billing?.payMode}，costUsd=${billing?.costUsd}`
        if (result === 'applied') this.logger.log(`供应商计费已落账：${summary}`)
        else if (result === 'duplicate') this.logger.log(`供应商计费事件重复，已跳过：${summary}`)
        else this.logger.warn(`供应商计费事件不完整，进入死信：${summary}`)
        return result === 'invalid' ? 'reject' : 'ack'
    }
}
