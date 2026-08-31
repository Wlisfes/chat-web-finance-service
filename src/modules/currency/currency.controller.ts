import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { TbFinanceCurrencyDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { CurrencyService } from '@/modules/currency/currency.service'
import {
    ListCurrencyDto,
    ListCurrencyExchangeDto,
    ResolveCurrencyExchangeDto,
    UpdateCurrencyStatusDto
} from '@/modules/currency/dto/currency.dto'
import {
    CurrencyExchangePageResponseDto,
    CurrencyExchangeResponseDto,
    CurrencyPageResponseDto,
    CurrencySelectResponseDto
} from '@/dto/api-response.dto'

@ApifoxController('财务中心-币种与汇率', 'currency', { bearerAuth: true })
export class CurrencyController {
    constructor(private readonly currencyService: CurrencyService) {}

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询币种' },
        request: { source: 'body', type: ListCurrencyDto },
        response: { type: CurrencyPageResponseDto, description: '币种分页数据' }
    })
    public async httpBaseFinanceColumnCurrency(@Body() input: ListCurrencyDto) {
        return this.currencyService.httpBaseFinanceColumnCurrency(input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新币种状态' },
        request: { source: 'body', type: UpdateCurrencyStatusDto },
        response: { type: TbFinanceCurrencyDto, description: '更新后的币种信息' }
    })
    public async httpBaseFinanceUpdateCurrencyStatus(@Body() input: UpdateCurrencyStatusDto) {
        return this.currencyService.httpBaseFinanceUpdateCurrencyStatus(input)
    }

    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用币种下拉选项' },
        response: { type: CurrencySelectResponseDto, description: '可用币种列表' }
    })
    public async httpBaseFinanceSelectCurrency() {
        return this.currencyService.httpBaseFinanceSelectCurrency()
    }

    @ApiServiceDecorator(Post('exchange/column'), {
        operation: { summary: '分页查询币种汇率' },
        request: { source: 'body', type: ListCurrencyExchangeDto },
        response: { type: CurrencyExchangePageResponseDto, description: '币种汇率分页数据' }
    })
    public async httpBaseFinanceColumnCurrencyExchange(@Body() input: ListCurrencyExchangeDto) {
        return this.currencyService.httpBaseFinanceColumnCurrencyExchange(input)
    }

    @ApiServiceDecorator(Get('exchange/resolver'), {
        operation: { summary: '获取币种最新汇率' },
        request: { source: 'query', type: ResolveCurrencyExchangeDto },
        response: { type: CurrencyExchangeResponseDto, description: '币种最新汇率' }
    })
    public async httpBaseFinanceResolverCurrencyExchange(@Query() input: ResolveCurrencyExchangeDto) {
        return this.currencyService.httpBaseFinanceResolverCurrencyExchange(input)
    }
}
