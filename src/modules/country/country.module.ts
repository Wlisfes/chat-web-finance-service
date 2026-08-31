import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { CountryController } from '@/modules/country/country.controller'
import { CountryService } from '@/modules/country/country.service'
import { CountryUtilsService } from '@/modules/country/country.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceCountry])],
    controllers: [CountryController],
    providers: [CountryService, CountryUtilsService]
})
export class CountryModule {}
