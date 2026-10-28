import { Module } from '@nestjs/common'
import { SrmUserAccountService } from '@/modules/srm-user/srm-user.account.service'
import { SrmUserBillingConsumer } from '@/modules/srm-user/srm-user.billing.consumer'

/** 供应商计费模块：消费 Dispatch 发布的计费事件落账，并向 SRM 提供供应商余额查询。不对接前端。 */
@Module({
    providers: [SrmUserAccountService, SrmUserBillingConsumer],
    exports: [SrmUserAccountService]
})
export class SrmUserModule {}
