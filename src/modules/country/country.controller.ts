import { Body, Post } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { CountryService } from '@/modules/country/country.service'
import { CountryPageResponseDto, CountrySelectResponseDto } from '@/dto/api-response.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as CountryDto from '@/modules/country/dto/country.dto'

@ApifoxController('财务中心-国家地区', 'country', { bearerAuth: true })
export class CountryController {
    constructor(private readonly countryService: CountryService) {}

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询国家地区' },
        request: { source: 'body', type: CountryDto.ListCountryDto },
        response: { type: CountryPageResponseDto, description: '国家地区分页数据' }
    })
    public async httpBaseFinanceColumnCountry(@Body() input: CountryDto.ListCountryDto) {
        return this.countryService.httpBaseFinanceColumnCountry(input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新国家地区状态' },
        request: { source: 'body', type: CountryDto.UpdateCountryStatusDto },
        response: { type: Schema.TbFinanceCountryDto, description: '更新后的国家地区信息' }
    })
    public async httpBaseFinanceUpdateCountryStatus(@Body() input: CountryDto.UpdateCountryStatusDto) {
        return this.countryService.httpBaseFinanceUpdateCountryStatus(input)
    }

    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用国家地区下拉选项' },
        response: { type: CountrySelectResponseDto, description: '可用国家地区列表' }
    })
    public async httpBaseFinanceSelectCountry() {
        return this.countryService.httpBaseFinanceSelectCountry()
    }
}
