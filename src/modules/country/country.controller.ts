import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CountryService } from '@/modules/country/country.service'
import { ListCountryDto, UpdateCountryStatusDto } from '@/modules/country/dto/country.dto'

@ApiTags('财务中心-国家地区')
@ApiBearerAuth('authorization')
@Controller('country')
export class CountryController {
    constructor(private readonly service: CountryService) {}
    @Post('column')
    list(@Body() input: ListCountryDto) {
        return this.service.list(input)
    }
    @Post('update/status')
    updateStatus(@Body() input: UpdateCountryStatusDto) {
        return this.service.updateStatus(input)
    }
    @Post('select')
    select() {
        return this.service.select()
    }
}
