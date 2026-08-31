import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCurrency, TbFinanceCurrencyExchange, TbFinanceCurrencyStatus } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { CurrencyExchangeListItemResponseDto, CurrencyExchangeResponseDto, CurrencySelectResponseDto } from '@/dto/api-response.dto'
import { CurrencyUtilsService } from '@/modules/currency/currency.utils.service'
import * as CurrencyDto from '@/modules/currency/dto/currency.dto'

@Injectable()
export class CurrencyService {
    constructor(
        @InjectRepository(TbFinanceCurrency) private readonly currencyRepository: Repository<TbFinanceCurrency>,
        @InjectRepository(TbFinanceCurrencyExchange) private readonly exchangeRepository: Repository<TbFinanceCurrencyExchange>,
        private readonly database: DataBaseService,
        private readonly currencyUtilsService: CurrencyUtilsService
    ) {}

    /**币种分页数据*/
    public async httpBaseFinanceColumnCurrency(body: CurrencyDto.ListCurrencyDto): Promise<PageResult<TbFinanceCurrency>> {
        return this.database.builder(this.currencyRepository, async qb => {
            if (isNotEmpty(body.name?.trim())) {
                qb.andWhere('t.name LIKE :name', { name: `%${body.name?.trim()}%` })
            }
            if (isNotEmpty(body.status)) {
                qb.andWhere('t.status = :status', { status: body.status })
            }
            qb.orderBy('t.createTime', 'DESC')
                .skip((body.page - 1) * body.size)
                .take(body.size)
            const [list, total] = await qb.getManyAndCount()
            return { page: body.page, size: body.size, total, list }
        })
    }

    /**编辑币种状态*/
    public async httpBaseFinanceUpdateCurrencyStatus(body: CurrencyDto.UpdateCurrencyStatusDto): Promise<TbFinanceCurrency> {
        return this.currencyRepository.manager.transaction(async manager => {
            const currency = await this.currencyUtilsService.findRequired(body.keyId, manager)
            currency.status = body.status
            return manager.save(currency)
        })
    }

    /**币种下拉数据*/
    public async httpBaseFinanceSelectCurrency(): Promise<CurrencySelectResponseDto> {
        const list = await this.database.builder(this.currencyRepository, qb => {
            return qb.where('t.status = :status', { status: TbFinanceCurrencyStatus.ENABLE }).orderBy('t.createTime', 'DESC').getMany()
        })
        return { list }
    }

    /**汇率分页数据*/
    public async httpBaseFinanceColumnCurrencyExchange(
        body: CurrencyDto.ListCurrencyExchangeDto
    ): Promise<PageResult<CurrencyExchangeListItemResponseDto>> {
        return this.database.builder(this.exchangeRepository, async qb => {
            if (isNotEmpty(body.currency?.trim())) {
                qb.andWhere('t.currency = :currency', { currency: body.currency?.trim() })
            }
            if (isNotEmpty(body.date)) {
                qb.andWhere('t.rateDate = :date', { date: body.date })
            }
            qb.orderBy('t.rateDate', 'DESC')
                .addOrderBy('t.currency', 'ASC')
                .skip((body.page - 1) * body.size)
                .take(body.size)
            const [items, total] = await qb.getManyAndCount()
            return { page: body.page, size: body.size, total, list: items.map(item => ({ ...item, date: item.rateDate })) }
        })
    }

    /**汇率详情*/
    public async httpBaseFinanceResolverCurrencyExchange(
        query: CurrencyDto.ResolveCurrencyExchangeDto
    ): Promise<CurrencyExchangeResponseDto> {
        const normalizedCurrency = query.currency.trim().toUpperCase()
        const currentDate = new Date().toISOString().slice(0, 10)
        if (normalizedCurrency === 'USD') {
            return { currency: 'USD', rate: 1, rateDate: currentDate, date: currentDate }
        }
        const exchange = await this.currencyUtilsService.findExchangeRequired(normalizedCurrency)
        return { ...exchange, date: exchange.rateDate }
    }
}
