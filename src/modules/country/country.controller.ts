import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CountryService } from '@/modules/country/country.service'
import { ListCountryDto, UpdateCountryStatusDto } from '@/modules/country/dto/country.dto'

@ApiTags('财务中心-国家地区')
@ApiBearerAuth('authorization')
@Controller('country')
export class CountryController {
    constructor(private readonly countryService: CountryService) {}
    @Post('column')
    httpBaseFinanceColumnCountry(@Body() input: ListCountryDto) {
        return this.countryService.list(input)
    }
    @Post('update/status')
    httpBaseFinanceUpdateCountryStatus(@Body() input: UpdateCountryStatusDto) {
        return this.countryService.updateStatus(input)
    }
    @Post('select')
    httpBaseFinanceSelectCountry() {
        return this.countryService.select()
    }
}
