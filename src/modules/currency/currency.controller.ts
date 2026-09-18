import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { CurrencyService } from '@/modules/currency/currency.service'
import { CurrencyExchangeSyncService } from '@/modules/currency/currency-exchange-sync.service'
import { AllowFinanceServiceToken } from '@/modules/auth/finance-auth.decorator'
import {
    CurrencyExchangePageResponseDto,
    CurrencyExchangeResponseDto,
    CurrencyExchangeSyncResponseDto,
    CurrencyPageResponseDto,
    CurrencySelectResponseDto
} from '@/dto/api-response.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as CurrencyDto from '@/modules/currency/dto/currency.dto'

@ApifoxController('财务中心-币种与汇率', 'currency', { bearerAuth: true })
export class CurrencyController {
    constructor(
        private readonly currencyService: CurrencyService,
        private readonly currencyExchangeSyncService: CurrencyExchangeSyncService
    ) {}

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询币种' },
        request: { source: 'body', type: CurrencyDto.ListCurrencyDto },
        response: { type: CurrencyPageResponseDto, description: '币种分页数据' }
    })
    public async httpBaseFinanceColumnCurrency(@Body() input: CurrencyDto.ListCurrencyDto) {
        return this.currencyService.httpBaseFinanceColumnCurrency(input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新币种状态' },
        request: { source: 'body', type: CurrencyDto.UpdateCurrencyStatusDto },
        response: { type: Schema.TbFinanceCurrencyDto, description: '更新后的币种信息' }
    })
    public async httpBaseFinanceUpdateCurrencyStatus(
        @Body() input: CurrencyDto.UpdateCurrencyStatusDto
    ): Promise<Schema.TbFinanceCurrencyDto> {
        return this.currencyService.httpBaseFinanceUpdateCurrencyStatus(input)
    }

    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用币种下拉选项' },
        response: { type: CurrencySelectResponseDto, description: '可用币种列表' }
    })
    public async httpBaseFinanceSelectCurrency(): Promise<CurrencySelectResponseDto> {
        return this.currencyService.httpBaseFinanceSelectCurrency()
    }

    @ApiServiceDecorator(Post('exchange/column'), {
        operation: { summary: '分页查询币种汇率' },
        request: { source: 'body', type: CurrencyDto.ListCurrencyExchangeDto },
        response: { type: CurrencyExchangePageResponseDto, description: '币种汇率分页数据' }
    })
    public async httpBaseFinanceColumnCurrencyExchange(@Body() input: CurrencyDto.ListCurrencyExchangeDto) {
        return this.currencyService.httpBaseFinanceColumnCurrencyExchange(input)
    }

    @ApiServiceDecorator(Get('exchange/resolve'), {
        operation: { summary: '获取币种最新汇率' },
        request: { source: 'query', type: CurrencyDto.ResolveCurrencyExchangeDto },
        response: { type: CurrencyExchangeResponseDto, description: '币种最新汇率' }
    })
    public async httpBaseFinanceResolverCurrencyExchange(
        @Query() input: CurrencyDto.ResolveCurrencyExchangeDto
    ): Promise<CurrencyExchangeResponseDto> {
        return this.currencyService.httpBaseFinanceResolverCurrencyExchange(input)
    }

    @ApiServiceDecorator(Post('exchange/sync'), {
        operation: { summary: '拉取并同步最新币种汇率' },
        response: { type: CurrencyExchangeSyncResponseDto, description: '汇率同步结果' }
    })
    @AllowFinanceServiceToken()
    public async httpBaseFinanceSyncCurrencyExchange(): Promise<CurrencyExchangeSyncResponseDto> {
        return this.currencyExchangeSyncService.httpBaseFinanceSyncCurrencyExchange()
    }
}
