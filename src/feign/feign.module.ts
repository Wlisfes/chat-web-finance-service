import { Module } from '@nestjs/common'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { FeignController } from '@/feign/feign.controller'
import { FeignService } from '@/feign/feign.service'
import { FrozenModule } from '@/modules/frozen/frozen.module'

@Module({
    imports: [CurrencyModule, FrozenModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
