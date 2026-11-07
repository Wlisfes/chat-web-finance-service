import { Module } from '@nestjs/common'
import { BrandModule } from '@/modules/brand/brand.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { FeignController } from '@/feign/feign.controller'
import { FeignService } from '@/feign/feign.service'
import { FrozenModule } from '@/modules/frozen/frozen.module'
import { CrmModule } from '@/modules/crm/crm.module'
import { SrmModule } from '@/modules/srm/srm.module'

@Module({
    imports: [BrandModule, CurrencyModule, FrozenModule, SrmModule, CrmModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
