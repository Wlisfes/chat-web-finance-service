import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCurrency, TbFinanceCurrencyExchange, TbFinanceCurrencyStatus } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { Repository } from 'typeorm'
import { ListCurrencyDto, ListCurrencyExchangeDto, UpdateCurrencyStatusDto } from '@/modules/currency/dto/currency.dto'

@Injectable()
export class CurrencyService {
    constructor(
        @InjectRepository(TbFinanceCurrency) private readonly currencyRepository: Repository<TbFinanceCurrency>,
        @InjectRepository(TbFinanceCurrencyExchange) private readonly exchangeRepository: Repository<TbFinanceCurrencyExchange>
    ) {}

    async list(input: ListCurrencyDto) {
        const query = this.currencyRepository.createQueryBuilder('currency')
        if (input.name?.trim()) query.andWhere('currency.name LIKE :name', { name: `%${input.name.trim()}%` })
        if (input.status) query.andWhere('currency.status = :status', { status: input.status })
        query
            .orderBy('currency.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [list, total] = await query.getManyAndCount()
        return { page: input.page, size: input.size, total, list }
    }

    async updateStatus(input: UpdateCurrencyStatusDto) {
        const currency = await this.currencyRepository.findOneBy({ keyId: input.keyId })
        if (!currency) throw new NotFoundException('币种不存在')
        currency.status = input.status
        return this.currencyRepository.save(currency)
    }

    async select() {
        const list = await this.currencyRepository.find({
            where: { status: TbFinanceCurrencyStatus.ENABLE },
            order: { createTime: 'DESC' }
        })
        return { list }
    }

    async listExchange(input: ListCurrencyExchangeDto) {
        const query = this.exchangeRepository.createQueryBuilder('exchange')
        if (input.currency?.trim()) query.andWhere('exchange.currency = :currency', { currency: input.currency.trim() })
        if (input.date) query.andWhere('exchange.rateDate = :date', { date: input.date })
        query.orderBy('exchange.rateDate', 'DESC').addOrderBy('exchange.currency', 'ASC')
        query.skip((input.page - 1) * input.size).take(input.size)
        const [items, total] = await query.getManyAndCount()
        return { page: input.page, size: input.size, total, list: items.map(item => ({ ...item, date: item.rateDate })) }
    }

    async resolveExchange(currency: string) {
        const normalizedCurrency = currency.trim().toUpperCase()
        const currentDate = new Date().toISOString().slice(0, 10)
        if (normalizedCurrency === 'USD') return { currency: 'USD', rate: 1, rateDate: currentDate, date: currentDate }
        const exchange = await this.exchangeRepository.findOne({
            where: { currency: normalizedCurrency },
            order: { rateDate: 'DESC', keyId: 'DESC' }
        })
        if (!exchange) throw new NotFoundException(`币种 ${normalizedCurrency} 暂无可用汇率`)
        return { ...exchange, date: exchange.rateDate }
    }
}
