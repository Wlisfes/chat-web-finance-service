import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeignClientAccountManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { CountryController } from '@/modules/country/country.controller'
import { CountryService } from '@/modules/country/country.service'
import { CountryUtilsService } from '@/modules/country/country.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceCountry]), FeignModule.register([FeignClientAccountManager])],
    controllers: [CountryController],
    providers: [CountryService, CountryUtilsService]
})
export class CountryModule {}
