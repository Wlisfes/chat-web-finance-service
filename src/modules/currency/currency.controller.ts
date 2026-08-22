import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrencyService } from '@/modules/currency/currency.service'
import { ListCurrencyDto, ListCurrencyExchangeDto, UpdateCurrencyStatusDto } from '@/modules/currency/dto/currency.dto'

@ApiTags('财务中心-币种与汇率')
@ApiBearerAuth('authorization')
@Controller('currency')
export class CurrencyController {
    constructor(private readonly currencyService: CurrencyService) {}

    @Post('column')
    httpBaseFinanceColumnCurrency(@Body() input: ListCurrencyDto) {
        return this.currencyService.list(input)
    }

    @Post('update/status')
    httpBaseFinanceUpdateCurrencyStatus(@Body() input: UpdateCurrencyStatusDto) {
        return this.currencyService.updateStatus(input)
    }

    @Post('select')
    httpBaseFinanceSelectCurrency() {
        return this.currencyService.select()
    }

    @Post('exchange/column')
    httpBaseFinanceColumnCurrencyExchange(@Body() input: ListCurrencyExchangeDto) {
        return this.currencyService.listExchange(input)
    }
}
