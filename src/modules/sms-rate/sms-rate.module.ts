import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceBasicSmsRate, TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SmsRateController } from '@/modules/sms-rate/sms-rate.controller'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'
import { SmsRateUtilsService } from '@/modules/sms-rate/sms-rate.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceBasicSmsRate, TbFinanceCountry])],
    controllers: [SmsRateController],
    providers: [SmsRateService, SmsRateUtilsService]
})
export class SmsRateModule {}
