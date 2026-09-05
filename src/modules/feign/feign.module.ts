import { Module } from '@nestjs/common'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'
import { SmsRateModule } from '@/modules/sms-rate/sms-rate.module'

@Module({
    imports: [CurrencyModule, SmsRateModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
