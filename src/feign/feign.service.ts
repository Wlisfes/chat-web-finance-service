import { Injectable } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { CurrencyService } from '@/modules/currency/currency.service'
import { CurrencyExchangeSyncService } from '@/modules/currency/currency-exchange-sync.service'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'

/** 统一编排财务服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignSchema.FeignClientFinanceManager implements FeignSchema.FinanceFeignImplementation {
    constructor(
        private readonly smsRateService: SmsRateService,
        private readonly currencyService: CurrencyService,
        private readonly currencyExchangeSyncService: CurrencyExchangeSyncService
    ) {
        super()
    }

    /** 按国家/地区主键批量获取短信基础价格。 */
    public override async httpBaseFinanceBatchSmsRate(
        _authorization: string,
        input: FeignSchema.FinanceSmsRateBatchRequest
    ): Promise<FeignSchema.FinanceSmsRate[]> {
        return this.smsRateService.httpBaseFinanceBatchSmsRate(input)
    }

    /** 按币种获取最新汇率。 */
    public override async httpBaseFinanceCurrencyExchangeResolver(
        _authorization: string,
        input: FeignSchema.FinanceCurrencyExchangeResolveRequest
    ): Promise<FeignSchema.FinanceCurrencyExchange> {
        return this.currencyService.httpBaseFinanceResolverCurrencyExchange(input)
    }

    /** 触发拉取并同步最新币种汇率。 */
    public override async httpBaseFinanceSyncCurrencyExchange(
        _authorization: string
    ): Promise<FeignSchema.FinanceCurrencyExchangeSyncResponse> {
        return this.currencyExchangeSyncService.httpBaseFinanceSyncCurrencyExchange()
    }
}
