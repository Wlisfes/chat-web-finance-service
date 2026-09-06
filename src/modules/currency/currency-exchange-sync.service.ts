import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCurrencyExchange } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { EntityManager, Repository } from 'typeorm'
import { CurrencyUtilsService } from '@/modules/currency/currency.utils.service'
import type { CurrencyExchangeSyncResponseDto } from '@/dto/api-response.dto'

interface FrankfurterRateRow {
    date?: string
    base?: string
    quote?: string
    rate?: number | string
}

interface FrankfurterRatesObject {
    date?: string
    base?: string
    rates?: Record<string, number | string>
}

/** 从外部数据源同步汇率时的统一业务实现；调度服务只负责触发此 Feign 接口。 */
@Injectable()
export class CurrencyExchangeSyncService {
    private readonly logger = new Logger(CurrencyExchangeSyncService.name)

    constructor(
        @InjectRepository(TbFinanceCurrencyExchange) private readonly exchangeRepository: Repository<TbFinanceCurrencyExchange>,
        private readonly currencyUtilsService: CurrencyUtilsService,
        private readonly configService: ConfigService
    ) {}

    /** 拉取当天汇率并在财务数据库中按币种与日期幂等写入。 */
    public async httpBaseFinanceSyncCurrencyExchange(): Promise<CurrencyExchangeSyncResponseDto> {
        const fetched = await this.fetchFrankfurterRates()
        let writableRates: Array<{ currency: string; rate: number }> = []

        await this.exchangeRepository.manager.transaction(async manager => {
            writableRates = await this.filterEnabledCurrencies(fetched.rates, manager)
            if (!writableRates.length) {
                throw new ServiceUnavailableException('没有可同步的启用币种')
            }
            await manager
                .createQueryBuilder()
                .insert()
                .into(TbFinanceCurrencyExchange)
                .values(writableRates.map(item => ({ ...item, rateDate: fetched.date })))
                .orUpdate(['rate'], ['currency', 'rateDate'])
                .updateEntity(false)
                .execute()
        })

        const result = {
            date: fetched.date,
            count: writableRates.length,
            list: writableRates.map(item => ({ ...item, date: fetched.date }))
        }
        this.logger.log(`汇率同步完成：日期=${result.date}，写入=${result.count} 条`)
        return result
    }

    private async filterEnabledCurrencies(
        rates: Array<{ currency: string; rate: number }>,
        manager: EntityManager
    ): Promise<Array<{ currency: string; rate: number }>> {
        const currencies = rates.map(item => item.currency)
        const enabled = await this.currencyUtilsService.findEnabledCurrencies(currencies, manager)
        return rates.filter(item => enabled.has(item.currency))
    }

    private async fetchFrankfurterRates(): Promise<{ date: string; rates: Array<{ currency: string; rate: number }> }> {
        const requestedDate = new Date().toISOString().slice(0, 10)
        const endpoint = this.configService.get<string>('integration.frankfurter.url')
        if (typeof endpoint !== 'string' || !endpoint.trim()) {
            throw new ServiceUnavailableException('缺少汇率数据源地址，请配置 integration.frankfurter.url')
        }
        const normalizedEndpoint = endpoint.trim()
        const requestedUrl = this.createFrankfurterUrl(normalizedEndpoint, requestedDate)
        let payload: unknown
        let rows: FrankfurterRateRow[] = []
        let rates: Array<{ currency: string; rate: number }> = []

        try {
            const requestedResponse = await this.fetchFrankfurterResponse(requestedUrl)
            if (requestedResponse.ok) {
                payload = await this.readFrankfurterPayload(requestedResponse)
                rows = this.parseRates(payload)
                rates = this.normalizeRates(rows)
            }
        } catch {
            // 周末、节假日或临时网络故障时回退 latest；两次请求都不可用才让任务失败。
        }

        if (!rates.length) {
            const latestResponse = await this.fetchFrankfurterResponse(this.createFrankfurterUrl(normalizedEndpoint))
            if (!latestResponse.ok) throw new ServiceUnavailableException(`Frankfurter 汇率服务返回 HTTP ${latestResponse.status}`)
            payload = await this.readFrankfurterPayload(latestResponse)
            rows = this.parseRates(payload)
            rates = this.normalizeRates(rows)
        }

        if (!rates.length) {
            throw new ServiceUnavailableException(`Frankfurter 汇率响应${rows.length ? '没有合法币种' : '没有可用数据'}`)
        }
        const date = this.resolveDate(payload, rows, requestedDate)
        if (!rates.some(item => item.currency === 'USD')) rates.unshift({ currency: 'USD', rate: 1 })
        return { date, rates: this.uniqueRates(rates) }
    }

    private createFrankfurterUrl(endpoint: string, date?: string): URL {
        const url = new URL(endpoint)
        if (url.pathname === '' || url.pathname === '/') url.pathname = '/v2/rates'
        url.searchParams.set('base', 'USD')
        if (date) url.searchParams.set('date', date)
        else url.searchParams.delete('date')
        return url
    }

    private async fetchFrankfurterResponse(url: URL): Promise<Response> {
        try {
            return await fetch(url, { signal: AbortSignal.timeout(this.getTimeout()) })
        } catch (error) {
            throw new ServiceUnavailableException(`Frankfurter 汇率服务连接失败：${this.errorMessage(error)}`)
        }
    }

    private async readFrankfurterPayload(response: Response): Promise<unknown> {
        try {
            return await response.json()
        } catch (error) {
            throw new ServiceUnavailableException(`Frankfurter 汇率响应不是有效 JSON：${this.errorMessage(error)}`)
        }
    }

    private parseRates(payload: unknown): FrankfurterRateRow[] {
        if (Array.isArray(payload)) return payload.filter(this.isRateRow)
        if (!payload || typeof payload !== 'object') return []
        const value = payload as FrankfurterRatesObject
        if (value.rates && typeof value.rates === 'object' && !Array.isArray(value.rates)) {
            return Object.entries(value.rates).map(([quote, rate]) => ({ quote, rate, base: value.base, date: value.date }))
        }
        return []
    }

    private resolveDate(payload: unknown, rows: FrankfurterRateRow[], fallback: string): string {
        const value = payload && typeof payload === 'object' ? (payload as FrankfurterRatesObject).date : undefined
        const date = value ?? rows.find(row => row.date)?.date
        return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback
    }

    private isRateRow(value: unknown): value is FrankfurterRateRow {
        return Boolean(value && typeof value === 'object' && 'quote' in value && 'rate' in value)
    }

    private normalizeRates(rows: FrankfurterRateRow[]): Array<{ currency: string; rate: number }> {
        return rows.flatMap(row => {
            if (typeof row.quote !== 'string' || !row.quote.trim()) return []
            if (typeof row.rate !== 'number' && typeof row.rate !== 'string') return []
            if (typeof row.rate === 'string' && !row.rate.trim()) return []
            const currency = row.quote.trim().toUpperCase()
            const rate = Number(row.rate)
            if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(rate) || rate < 0) return []
            return [{ currency, rate: Number(rate.toFixed(6)) }]
        })
    }

    private uniqueRates(rates: Array<{ currency: string; rate: number }>): Array<{ currency: string; rate: number }> {
        const seen = new Set<string>()
        return rates.filter(item => {
            if (seen.has(item.currency)) return false
            seen.add(item.currency)
            return true
        })
    }

    private getTimeout(): number {
        const configured = this.configService.get<number | string>('integration.frankfurter.timeout')
        if (configured === undefined || configured === '') return 10_000
        const timeout = Number(configured)
        return Number.isInteger(timeout) && timeout >= 1000 && timeout <= 60_000 ? timeout : 10_000
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
