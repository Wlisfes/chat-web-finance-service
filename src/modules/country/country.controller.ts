import { Body, Post } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { TbFinanceCountryDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { CountryService } from '@/modules/country/country.service'
import { ListCountryDto, UpdateCountryStatusDto } from '@/modules/country/dto/country.dto'
import { CountryPageResponseDto, CountrySelectResponseDto } from '@/dto/api-response.dto'

@ApifoxController('财务中心-国家地区', 'country', { bearerAuth: true })
export class CountryController {
    constructor(private readonly countryService: CountryService) {}

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询国家地区' },
        request: { source: 'body', type: ListCountryDto },
        response: { type: CountryPageResponseDto, description: '国家地区分页数据' }
    })
    httpBaseFinanceColumnCountry(@Body() input: ListCountryDto) {
        return this.countryService.list(input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新国家地区状态' },
        request: { source: 'body', type: UpdateCountryStatusDto },
        response: { type: TbFinanceCountryDto, description: '更新后的国家地区信息' }
    })
    httpBaseFinanceUpdateCountryStatus(@Body() input: UpdateCountryStatusDto) {
        return this.countryService.updateStatus(input)
    }

    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用国家地区下拉选项' },
        response: { type: CountrySelectResponseDto, description: '可用国家地区列表' }
    })
    httpBaseFinanceSelectCountry() {
        return this.countryService.select()
    }
}
