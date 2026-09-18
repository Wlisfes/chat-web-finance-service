import { Injectable, NotFoundException } from '@nestjs/common'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, EntityManager, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class CurrencyUtilsService {
    constructor(
        @InjectRepository(Schema.TbFinanceCurrency) private readonly currencyRepository: Repository<Schema.TbFinanceCurrency>,
        @InjectRepository(Schema.TbFinanceCurrencyExchange)
        private readonly exchangeRepository: Repository<Schema.TbFinanceCurrencyExchange>,
        private readonly database: DataBaseService
    ) {}

    /**获取币种详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbFinanceCurrency> {
        const repository = (manager ?? this.currencyRepository.manager).getRepository(Schema.TbFinanceCurrency)
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
    public async findExchangeRequired(currency: string): Promise<Schema.TbFinanceCurrencyExchange> {
        const exchange = await this.database.builder(this.exchangeRepository, qb => {
            return qb.where('t.currency = :currency', { currency }).orderBy('t.rateDate', 'DESC').addOrderBy('t.keyId', 'DESC').getOne()
        })
        if (!exchange) {
            throw new NotFoundException(`币种 ${currency} 暂无可用汇率`)
        }
        return exchange
    }

    /**获取已启用的币种编码；用于过滤外部汇率同步数据。*/
    public async findEnabledCurrencies(currencies: string[], manager?: EntityManager): Promise<Set<string>> {
        if (!currencies.length) return new Set()
        const repository = (manager ?? this.currencyRepository.manager).getRepository(Schema.TbFinanceCurrency)
        const list = await this.database.builder(repository, qb => {
            return qb
                .where('t.status = :status', { status: Schema.TbFinanceCurrencyStatus.ENABLE })
                .andWhere('t.currency IN (:...currencies)', { currencies })
                .getMany()
        })
        return new Set(list.map(item => item.currency.trim().toUpperCase()))
    }
}
