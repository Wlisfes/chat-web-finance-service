import { Injectable } from '@nestjs/common'
import {
    FeignClientFinanceManager,
    FinanceCurrencyExchange,
    FinanceCurrencyExchangeSyncResponse,
    FinanceFeignImplementation,
    FinanceSmsRate,
    FinanceSmsRateBatchRequest
} from '@wlisfes/chat-web-base-schema/feign'
import { CurrencyService } from '@/modules/currency/currency.service'
import { CurrencyExchangeSyncService } from '@/modules/currency/currency-exchange-sync.service'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'

/** 统一编排财务服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignClientFinanceManager implements FinanceFeignImplementation {
    constructor(
        private readonly smsRateService: SmsRateService,
        private readonly currencyService: CurrencyService,
        private readonly currencyExchangeSyncService: CurrencyExchangeSyncService
    ) {
        super()
    }

    public override async batchSmsRates(_authorization: string, input: FinanceSmsRateBatchRequest): Promise<FinanceSmsRate[]> {
        return this.smsRateService.httpBaseFinanceBatchSmsRate(input)
    }

    public override async resolveCurrencyExchange(_authorization: string, currency: string): Promise<FinanceCurrencyExchange> {
        return this.currencyService.httpBaseFinanceResolverCurrencyExchange({ currency })
    }

    public override async syncCurrencyExchange(_authorization: string): Promise<FinanceCurrencyExchangeSyncResponse> {
        return this.currencyExchangeSyncService.httpBaseFinanceSyncCurrencyExchange()
    }
}
