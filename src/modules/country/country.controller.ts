import { Body, Get, Post } from '@nestjs/common'
import { CurrentPrincipal, RequirePermissions, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { CountryService } from '@/modules/country/country.service'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as CountryDto from '@/modules/country/dto/country.dto'

@ApifoxController('财务中心-国家地区', 'country', { bearerAuth: true })
export class CountryController {
    constructor(private readonly countryService: CountryService) {}

    @RequirePermissions('chat:finance:base:country')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取国家地区状态枚举' },
        response: { type: CountryDto.CountryEnumsResponseDto, description: '国家地区静态枚举' }
    })
    public async httpBaseFinanceCountryEnums() {
        return this.countryService.httpBaseFinanceCountryEnums()
    }

    @RequirePermissions('chat:finance:base:country')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询国家地区' },
        request: { source: 'body', type: CountryDto.ListCountryDto },
        response: { type: CountryDto.CountryPageResponseDto, description: '国家地区分页数据' }
    })
    public async httpBaseFinanceColumnCountry(@Body() input: CountryDto.ListCountryDto) {
        return this.countryService.httpBaseFinanceColumnCountry(input)
    }

    @RequirePermissions('chat:finance:base:country:update')
    @ApiServiceDecorator(Post('status/update'), {
        operation: { summary: '更新国家地区状态' },
        request: { source: 'body', type: CountryDto.UpdateCountryStatusDto },
        response: { type: Schema.TbFinanceCountryDto, description: '更新后的国家地区信息' }
    })
    public async httpBaseFinanceCountryStatusUpdate(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: CountryDto.UpdateCountryStatusDto
    ) {
        return this.countryService.httpBaseFinanceCountryStatusUpdate(principal, input)
    }

    @RequirePermissions('*')
    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用国家地区下拉选项' },
        response: { type: CountryDto.CountrySelectResponseDto, isArray: true, description: '可用国家地区列表' }
    })
    public async httpBaseFinanceSelectCountry() {
        return this.countryService.httpBaseFinanceSelectCountry()
    }
}
