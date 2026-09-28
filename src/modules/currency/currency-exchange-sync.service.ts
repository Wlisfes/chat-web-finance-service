import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository, EntityManager, In, Repository } from '@wlisfes/chat-web-base-schema/database'
import { CurrencyUtilsService } from '@/modules/currency/currency.utils.service'
import { ConfigService } from '@nestjs/config'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as CurrencyDto from '@/modules/currency/dto/currency.dto'

/**汇率同步条目*/
type ExchangeRateItem = { currency: string; rate: number }

interface OpenExchangeRatesPayload {
    base?: string
    rates?: Record<string, number | string>
}

/** Open Exchange Rates 最新汇率接口；App ID 只从 Nacos 读取，不写入仓库。 */
const OPEN_EXCHANGE_RATES_LATEST_URL = 'https://openexchangerates.org/api/latest.json'

/** 外部汇率接口发生瞬时网络错误时的最大尝试次数。 */
const EXCHANGE_RATE_RETRY_ATTEMPTS = 2

/** 外部汇率接口重试间隔，避免网络恢复瞬间产生连续请求。 */
const EXCHANGE_RATE_RETRY_DELAY_MS = 1000

/** 东八区汇率快照使用的固定时区。 */
const EXCHANGE_RATE_TIME_ZONE = 'Asia/Shanghai'

/** 从外部数据源同步汇率时的统一业务实现；调度服务只负责触发此 Feign 接口。 */
@Injectable()
export class CurrencyExchangeSyncService {
    private readonly logger = new Logger(CurrencyExchangeSyncService.name)

    constructor(
        @InjectRepository(Schema.TbFinanceCurrencyExchange)
        private readonly exchangeRepository: Repository<Schema.TbFinanceCurrencyExchange>,
        private readonly currencyUtilsService: CurrencyUtilsService,
        private readonly configService: ConfigService
    ) {}

    /**同步最新汇率：按东八区当天日期新增启用币种汇率，已入库的汇率不更新*/
    public async httpBaseFinanceSyncCurrencyExchange(): Promise<CurrencyDto.CurrencyExchangeSyncResponseDto> {
        const { date, rates } = await this.fetchOpenExchangeRates()
        const list = await this.exchangeRepository.manager.transaction(async manager => {
            const enabledRates = await this.filterEnabledRates(rates, manager)
            if (enabledRates.length === 0) {
                throw new ServiceUnavailableException('没有可同步的启用币种')
            }
            const pendingRates = await this.filterPendingRates(date, enabledRates, manager)
            await this.insertExchangeRates(date, pendingRates, manager)
            return pendingRates.map(item => ({ ...item, date }))
        })
        if (list.length > 0) {
            this.logger.log(`汇率同步完成：日期=${date}，新增=${list.length} 条`)
        } else {
            this.logger.log(`汇率已存在，跳过写入：日期=${date}`)
        }
        return { date, count: list.length, list }
    }

    /**过滤出已启用的币种汇率*/
    private async filterEnabledRates(rates: ExchangeRateItem[], manager: EntityManager): Promise<ExchangeRateItem[]> {
        const currencies = rates.map(item => item.currency)
        const enabled = await this.currencyUtilsService.findEnabledCurrencies(currencies, manager)
        return rates.filter(item => enabled.has(item.currency))
    }

    /**过滤出当天尚未入库的币种汇率*/
    private async filterPendingRates(date: string, rates: ExchangeRateItem[], manager: EntityManager): Promise<ExchangeRateItem[]> {
        const existing = await manager.find(Schema.TbFinanceCurrencyExchange, {
            select: ['currency'],
            where: { date, currency: In(rates.map(item => item.currency)) }
        })
        const existingCurrencies = new Set(existing.map(item => item.currency.trim().toUpperCase()))
        return rates.filter(item => !existingCurrencies.has(item.currency))
    }

    /**批量写入汇率；由定时任务写入，创建人、更新人统一记为系统账号*/
    private async insertExchangeRates(date: string, rates: ExchangeRateItem[], manager: EntityManager): Promise<void> {
        if (rates.length === 0) {
            return
        } else {
            const items = rates.map(item => ({ ...item, date, createBy: feign.ACCOUNT_SYSTEM_UID, modifyBy: feign.ACCOUNT_SYSTEM_UID }))
            await manager.createQueryBuilder().insert().into(Schema.TbFinanceCurrencyExchange).values(items).updateEntity(false).execute()
        }
    }

    private async fetchOpenExchangeRates(): Promise<{ date: string; rates: ExchangeRateItem[] }> {
        const appId = this.configService.get<string>('integration.openExchangeRates.appid')
        if (typeof appId !== 'string' || !appId.trim()) {
            throw new ServiceUnavailableException('缺少汇率数据源凭据，请配置 integration.openExchangeRates.appid')
        }

        const response = await this.fetchOpenExchangeRatesResponseWithRetry(this.createOpenExchangeRatesUrl(appId.trim()))
        if (!response.ok) {
            throw new ServiceUnavailableException(`Open Exchange Rates 汇率服务返回 HTTP ${response.status}`)
        }
        const payload = await this.readOpenExchangeRatesPayload(response)
        if (payload.base !== 'USD') {
            throw new ServiceUnavailableException('Open Exchange Rates 汇率基准币种不是 USD')
        }
        const rates = this.normalizeRates(payload.rates)
        if (!rates.length) {
            throw new ServiceUnavailableException('Open Exchange Rates 汇率响应没有可用数据')
        }
        if (!rates.some(item => item.currency === 'USD')) {
            rates.unshift({ currency: 'USD', rate: 1 })
        }
        return { date: this.currentRateDate(), rates: this.uniqueRates(rates) }
    }

    private createOpenExchangeRatesUrl(appId: string): URL {
        const url = new URL(OPEN_EXCHANGE_RATES_LATEST_URL)
        url.searchParams.set('app_id', appId)
        return url
    }

    private async fetchOpenExchangeRatesResponse(url: URL): Promise<Response> {
        try {
            return await fetch(url, { signal: AbortSignal.timeout(this.getTimeout()) })
        } catch (error) {
            throw new ServiceUnavailableException(`Open Exchange Rates 汇率服务连接失败：${this.errorMessage(error)}`)
        }
    }

    /** 对外部请求做一次退避重试，覆盖容器 DNS、连接建立和上游短暂不可用。 */
    private async fetchOpenExchangeRatesResponseWithRetry(url: URL): Promise<Response> {
        let lastError: unknown
        for (let attempt = 1; attempt <= EXCHANGE_RATE_RETRY_ATTEMPTS; attempt += 1) {
            try {
                const response = await this.fetchOpenExchangeRatesResponse(url)
                if (response.ok || response.status < 500 || attempt === EXCHANGE_RATE_RETRY_ATTEMPTS) {
                    return response
                }
            } catch (error) {
                lastError = error
                if (attempt === EXCHANGE_RATE_RETRY_ATTEMPTS) {
                    throw error
                }
            }
            this.logger.warn(`Open Exchange Rates 请求失败，第 ${attempt}/${EXCHANGE_RATE_RETRY_ATTEMPTS} 次后重试`)
            await new Promise<void>(resolve => setTimeout(resolve, EXCHANGE_RATE_RETRY_DELAY_MS))
        }

        throw lastError instanceof Error ? lastError : new ServiceUnavailableException('Open Exchange Rates 请求失败')
    }

    private async readOpenExchangeRatesPayload(response: Response): Promise<OpenExchangeRatesPayload> {
        try {
            const payload: unknown = await response.json()
            return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as OpenExchangeRatesPayload) : {}
        } catch (error) {
            throw new ServiceUnavailableException(`Open Exchange Rates 汇率响应不是有效 JSON：${this.errorMessage(error)}`)
        }
    }

    private normalizeRates(rates: OpenExchangeRatesPayload['rates']): ExchangeRateItem[] {
        if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
            return []
        }
        return Object.entries(rates).flatMap(([quote, value]) => {
            if (typeof value !== 'number' && typeof value !== 'string') {
                return []
            }
            if (typeof value === 'string' && !value.trim()) {
                return []
            }
            const currency = quote.trim().toUpperCase()
            const rate = Number(value)
            if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate < 0) {
                return []
            }
            return [{ currency, rate: Number(rate.toFixed(6)) }]
        })
    }

    private uniqueRates(rates: ExchangeRateItem[]): ExchangeRateItem[] {
        const seen = new Set<string>()
        return rates.filter(item => {
            if (seen.has(item.currency)) {
                return false
            }
            seen.add(item.currency)
            return true
        })
    }

    private currentRateDate(now = new Date()): string {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: EXCHANGE_RATE_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(now)
        const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
        return `${value.year}-${value.month}-${value.day}`
    }

    private getTimeout(): number {
        const configured = this.configService.get<number | string>('integration.openExchangeRates.timeout')
        if (configured === undefined || configured === '') {
            return 10_000
        }
        const timeout = Number(configured)
        return Number.isInteger(timeout) && timeout >= 1000 && timeout <= 60_000 ? timeout : 10_000
    }

    private errorMessage(error: unknown): string {
        if (!(error instanceof Error)) {
            return String(error)
        }
        const cause = (error as Error & { cause?: unknown }).cause
        if (cause instanceof Error && cause.message && cause.message !== error.message) {
            return `${error.message}（原因：${cause.message}）`
        }
        if (cause && typeof cause === 'object' && 'code' in cause) {
            const code = (cause as { code?: unknown }).code
            if (typeof code === 'string' && code) {
                return `${error.message}（code=${code}）`
            }
        }
        return error.message
    }
}
