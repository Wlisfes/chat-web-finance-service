import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrencyService } from '@/modules/currency/currency.service'
import { ListCurrencyDto, ListCurrencyExchangeDto, UpdateCurrencyStatusDto } from '@/modules/currency/dto/currency.dto'

@ApiTags('财务中心-币种与汇率')
@ApiBearerAuth('authorization')
@Controller('currency')
export class CurrencyController {
    constructor(private readonly service: CurrencyService) {}

    @Post('column')
    list(@Body() input: ListCurrencyDto) {
        return this.service.list(input)
    }

    @Post('update/status')
    updateStatus(@Body() input: UpdateCurrencyStatusDto) {
        return this.service.updateStatus(input)
    }

    @Post('select')
    select() {
        return this.service.select()
    }

    @Post('exchange/column')
    listExchange(@Body() input: ListCurrencyExchangeDto) {
        return this.service.listExchange(input)
    }
}
