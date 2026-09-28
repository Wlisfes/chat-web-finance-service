import { Body, Get, Post, Query } from '@nestjs/common'
import { CurrentPrincipal, RequirePermissions, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { CurrencyService } from '@/modules/currency/currency.service'
import { CurrencyExchangeSyncService } from '@/modules/currency/currency-exchange-sync.service'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as CurrencyDto from '@/modules/currency/dto/currency.dto'

@ApifoxController('财务中心-币种与汇率', 'currency', { bearerAuth: true })
export class CurrencyController {
    constructor(
        private readonly currencyService: CurrencyService,
        private readonly currencyExchangeSyncService: CurrencyExchangeSyncService
    ) {}

    @RequirePermissions('chat:finance:base:currency')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取币种状态枚举' },
        response: { type: CurrencyDto.CurrencyEnumsResponseDto, description: '币种静态枚举' }
    })
    public async httpBaseFinanceCurrencyEnums(): Promise<CurrencyDto.CurrencyEnumsResponseDto> {
        return this.currencyService.httpBaseFinanceCurrencyEnums()
    }

    @RequirePermissions('chat:finance:base:currency')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询币种' },
        request: { source: 'body', type: CurrencyDto.ListCurrencyDto },
        response: { type: CurrencyDto.CurrencyPageResponseDto, description: '币种分页数据' }
    })
    public async httpBaseFinanceColumnCurrency(@Body() input: CurrencyDto.ListCurrencyDto) {
        return this.currencyService.httpBaseFinanceColumnCurrency(input)
    }

    @RequirePermissions('chat:finance:base:currency:update')
    @ApiServiceDecorator(Post('status/update'), {
        operation: { summary: '更新币种状态' },
        request: { source: 'body', type: CurrencyDto.UpdateCurrencyStatusDto },
        response: { type: Schema.TbFinanceCurrencyDto, description: '更新后的币种信息' }
    })
    public async httpBaseFinanceCurrencyStatusUpdate(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: CurrencyDto.UpdateCurrencyStatusDto
    ): Promise<Schema.TbFinanceCurrencyDto> {
        return this.currencyService.httpBaseFinanceCurrencyStatusUpdate(principal, input)
    }

    @RequirePermissions('*')
    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用币种下拉选项' },
        response: { type: CurrencyDto.CurrencySelectResponseDto, isArray: true, description: '可用币种列表' }
    })
    public async httpBaseFinanceSelectCurrency(): Promise<CurrencyDto.CurrencySelectResponseDto[]> {
        return this.currencyService.httpBaseFinanceSelectCurrency()
    }

    @RequirePermissions('chat:finance:base:exchange')
    @ApiServiceDecorator(Post('exchange/column'), {
        operation: { summary: '分页查询币种汇率' },
        request: { source: 'body', type: CurrencyDto.ListCurrencyExchangeDto },
        response: { type: CurrencyDto.CurrencyExchangePageResponseDto, description: '币种汇率分页数据' }
    })
    public async httpBaseFinanceColumnCurrencyExchange(@Body() input: CurrencyDto.ListCurrencyExchangeDto) {
        return this.currencyService.httpBaseFinanceColumnCurrencyExchange(input)
    }

    @RequirePermissions('chat:finance:base:exchange')
    @ApiServiceDecorator(Get('exchange/resolve'), {
        operation: { summary: '获取币种最新汇率' },
        request: { source: 'query', type: CurrencyDto.ResolveCurrencyExchangeDto },
        response: { type: CurrencyDto.CurrencyExchangeResponseDto, description: '币种最新汇率' }
    })
    public async httpBaseFinanceResolverCurrencyExchange(
        @Query() input: CurrencyDto.ResolveCurrencyExchangeDto
    ): Promise<CurrencyDto.CurrencyExchangeResponseDto> {
        return this.currencyService.httpBaseFinanceResolverCurrencyExchange(input)
    }

    @RequirePermissions('chat:finance:base:exchange')
    @ApiServiceDecorator(Post('exchange/sync'), {
        operation: { summary: '拉取并同步最新币种汇率' },
        response: { type: CurrencyDto.CurrencyExchangeSyncResponseDto, description: '汇率同步结果' }
    })
    public async httpBaseFinanceSyncCurrencyExchange(): Promise<CurrencyDto.CurrencyExchangeSyncResponseDto> {
        return this.currencyExchangeSyncService.httpBaseFinanceSyncCurrencyExchange()
    }
}
