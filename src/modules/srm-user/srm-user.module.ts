import { Module } from '@nestjs/common'
import { SrmUserAccountService } from '@/modules/srm-user/srm-user.account.service'

/** 供应商余额查询。扣费已改由 Charge 服务处理，本模块不再消费计费事件。 */
@Module({
    providers: [SrmUserAccountService],
    exports: [SrmUserAccountService]
})
export class SrmUserModule {}
