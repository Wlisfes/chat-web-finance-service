import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCurrency, TbFinanceCurrencyExchange } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from 'class-validator'
import { EntityManager, Repository } from 'typeorm'

@Injectable()
export class CurrencyUtilsService {
    constructor(
        @InjectRepository(TbFinanceCurrency) private readonly currencyRepository: Repository<TbFinanceCurrency>,
        @InjectRepository(TbFinanceCurrencyExchange) private readonly exchangeRepository: Repository<TbFinanceCurrencyExchange>,
        private readonly database: DataBaseService
    ) {}

    /**获取币种详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbFinanceCurrency> {
        const repository = (manager ?? this.currencyRepository.manager).getRepository(TbFinanceCurrency)
        const currency = await this.database.builder(repository, qb => {
            qb.where('t.keyId = :keyId', { keyId })
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getOne()
        })
        if (!currency) {
            throw new NotFoundException('币种不存在')
        }
        return currency
    }

    /**获取币种最新汇率*/
    public async findExchangeRequired(currency: string): Promise<TbFinanceCurrencyExchange> {
        const exchange = await this.database.builder(this.exchangeRepository, qb => {
            return qb.where('t.currency = :currency', { currency }).orderBy('t.rateDate', 'DESC').addOrderBy('t.keyId', 'DESC').getOne()
        })
        if (!exchange) {
            throw new NotFoundException(`币种 ${currency} 暂无可用汇率`)
        }
        return exchange
    }
}
