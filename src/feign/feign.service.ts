import { Injectable } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { BrandUtilsService } from '@/modules/brand/brand.utils.service'
import { CurrencyService } from '@/modules/currency/currency.service'
import { CurrencyExchangeSyncService } from '@/modules/currency/currency-exchange-sync.service'
import { FrozenSmsUtilsService } from '@/modules/frozen/sms/sms.utils.service'

/** 统一编排财务服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignSchema.FeignClientFinanceManager implements FeignSchema.FinanceFeignImplementation {
    constructor(
        private readonly brandUtilsService: BrandUtilsService,
        private readonly frozenSmsUtilsService: FrozenSmsUtilsService,
        private readonly currencyService: CurrencyService,
        private readonly currencyExchangeSyncService: CurrencyExchangeSyncService
    ) {
        super()
    }

    /** 按品牌主键批量获取品牌展示摘要。 */
    public override async httpBaseFinanceColumnBrandResolver(
        _authorization: string,
        input: FeignSchema.FinanceColumnBrandResolverRequest
    ): Promise<FeignSchema.FinanceBrandSummary[]> {
        return this.brandUtilsService.findColumnResolver(input.keyIds ?? [])
    }

    /** 按品牌主键获取单个品牌展示摘要。 */
    public override async httpBaseFinanceBrandResolver(
        _authorization: string,
        input: FeignSchema.FinanceBrandResolverRequest
    ): Promise<FeignSchema.FinanceBrandSummary> {
        const brand = await this.brandUtilsService.findRequired(input.keyId)
        return { keyId: brand.keyId, name: brand.name, status: brand.status }
    }

    /** 按国家/地区主键批量获取短信基础价格。 */
    public override async httpBaseFinanceColumnFrozenSmsResolver(
        _authorization: string,
        input: FeignSchema.FinanceColumnFrozenSmsResolverRequest
    ): Promise<FeignSchema.FinanceFrozenSmsSummary[]> {
        return this.frozenSmsUtilsService.findColumnResolver(input.countryKeyIds ?? [])
    }

    /** 按国家/地区主键获取单个短信基础价格。 */
    public override async httpBaseFinanceFrozenSmsResolver(
        _authorization: string,
        input: FeignSchema.FinanceFrozenSmsResolverRequest
    ): Promise<FeignSchema.FinanceFrozenSmsSummary> {
        return this.frozenSmsUtilsService.findResolver(input.countryKeyId)
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
