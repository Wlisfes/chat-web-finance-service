import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceBasicSmsRate, TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SmsRateController } from '@/modules/sms-rate/sms-rate.controller'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceBasicSmsRate, TbFinanceCountry])],
    controllers: [SmsRateController],
    providers: [SmsRateService]
})
export class SmsRateModule {}
