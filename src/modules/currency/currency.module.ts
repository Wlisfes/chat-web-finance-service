import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceCurrency, TbFinanceCurrencyExchange } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { CurrencyController } from '@/modules/currency/currency.controller'
import { CurrencyService } from '@/modules/currency/currency.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceCurrency, TbFinanceCurrencyExchange])],
    controllers: [CurrencyController],
    providers: [CurrencyService]
})
export class CurrencyModule {}
