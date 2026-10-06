import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository, DataBaseService, EntityManager, In, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty, fetchDivNumber, fetchMinusNumner, fetchPlusNumber, fetchTimesNumber } from '@wlisfes/chat-web-base-schema/utils'
import * as SmsConstants from '@/modules/frozen/sms/sms.constants'
import type * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

@Injectable()
export class FrozenSmsUtilsService {
    constructor(
        @InjectRepository(Schema.TbFinanceFrozenSms) private readonly rateRepository: Repository<Schema.TbFinanceFrozenSms>,
        @InjectRepository(Schema.TbFinanceCountry) private readonly countryRepository: Repository<Schema.TbFinanceCountry>,
        private readonly database: DataBaseService
    ) {}

    /**获取短信基础价格详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbFinanceFrozenSms> {
        const repository = (manager ?? this.rateRepository.manager).getRepository(Schema.TbFinanceFrozenSms)
        const rate = await this.database.builder(repository, qb => {
            qb.where('t.keyId = :keyId', { keyId })
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getOne()
        })
        if (!rate) {
            throw new NotFoundException('短信基础价格不存在')
        }
        return rate
    }

    /**按国家/地区批量获取短信基础价格并加锁；每个国家/地区只有一条价格，有未配置的国家/地区时拒绝*/
    public async findListRequired(countryKeyIds: number[], manager: EntityManager): Promise<Schema.TbFinanceFrozenSms[]> {
        const rates = await manager.find(Schema.TbFinanceFrozenSms, {
            where: { countryKeyId: In(countryKeyIds) },
            lock: { mode: 'pessimistic_write' }
        })
        if (rates.length !== countryKeyIds.length) {
            throw new NotFoundException('部分国家/地区未配置短信基础价格，请先新增后再调价')
        }
        return rates
    }

    /**美元价格转换为存储值（放大百万倍的整数）*/
    public fetchStoragePrice(usd: number): number {
        return Math.round(fetchTimesNumber(usd, 1000000))
    }

    /**存储值（放大百万倍的整数）转换为美元价格*/
    public fetchUsdPrice(price: number): number {
        return fetchDivNumber(price, 1000000)
    }

    /**把短信基础价格记录的价格字段转换为美元返回*/
    public fetchUsdRate<T extends Pick<Schema.TbFinanceFrozenSms, 'upUsd' | 'downUsd'>>(rate: T): T {
        return { ...rate, upUsd: this.fetchUsdPrice(rate.upUsd), downUsd: this.fetchUsdPrice(rate.downUsd) }
    }

    /**校验批量调价的调整值：上行、下行不能同时为 0；按百分比时最多保留 2 位小数*/
    public findFluctuateValueRequired(
        values: number[],
        rule: (typeof SmsConstants.FrozenSmsFluctuateRules)[SmsConstants.FrozenSmsFluctuateMode]
    ) {
        if (values.every(value => value === 0)) {
            throw new BadRequestException('上行、下行调整值不能同时为0')
        }
        if (!rule.amount && values.some(value => !Number.isInteger(fetchTimesNumber(value, 100)))) {
            throw new BadRequestException('按百分比调整时最多保留2位小数')
        }
    }

    /**
     * 计算调价后的价格（价格按放大百万倍的整数存储），全部使用 big.js 精确运算。
     *
     * - 按金额：调整额 = 美元金额 × 1000000；
     * - 按百分比：调整额 = 价格 × 百分比 / 100；
     * - 最终价格 = 价格 ± 调整额，四舍五入为整数。
     */
    public fetchFluctuatePrice(
        price: number,
        value: number,
        rule: (typeof SmsConstants.FrozenSmsFluctuateRules)[SmsConstants.FrozenSmsFluctuateMode]
    ): number {
        const delta = rule.amount ? fetchTimesNumber(value, 1000000) : fetchDivNumber(fetchTimesNumber(price, value), 100)
        return Math.round(rule.increase ? fetchPlusNumber(price, delta) : fetchMinusNumner(price, delta))
    }

    /**校验国家地区价格是否已配置*/
    public async findAvailable(countryKeyId: number, manager?: EntityManager, excludedKeyId?: number): Promise<void> {
        const repository = (manager ?? this.rateRepository.manager).getRepository(Schema.TbFinanceFrozenSms)
        const exists = await this.database.builder(repository, qb => {
            qb.where('t.countryKeyId = :countryKeyId', { countryKeyId })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('该国家/地区已配置过价格')
        }
    }

    /**按主键获取国家地区选项*/
    public async findCountriesByKeyIds(countryKeyIds: number[]): Promise<Schema.TbFinanceCountry[]> {
        const uniqueKeyIds = [...new Set(countryKeyIds)]
        if (uniqueKeyIds.length === 0) {
            return []
        }
        return this.database.builder(this.countryRepository, qb => {
            qb.select(['t.keyId', 't.code', 't.mcc', 't.cnName', 't.enName'])
            qb.where('t.keyId IN (:...countryKeyIds)', { countryKeyIds: uniqueKeyIds })
            return qb.getMany()
        })
    }

    /**获取指定国家地区*/
    public async findCountriesRequired(countryKeyIds: number[]): Promise<Schema.TbFinanceCountry[]> {
        const countries = await this.database.builder(this.countryRepository, qb => {
            return qb.where('t.keyId IN (:...countryKeyIds)', { countryKeyIds }).getMany()
        })
        if (countries.length !== countryKeyIds.length) {
            throw new BadRequestException('部分国家/地区不存在')
        }
        return countries
    }

    /**按国家/地区主键批量获取短信基础价格摘要，供 Feign 使用；未配置价格的国家/地区直接忽略*/
    public async findColumnResolver(countryKeyIds: number[]): Promise<feign.FinanceFrozenSmsSummary[]> {
        const uniqueKeyIds = [...new Set(countryKeyIds)].filter(keyId => Number.isInteger(keyId) && keyId > 0)
        if (uniqueKeyIds.length === 0) {
            return []
        }
        if (uniqueKeyIds.length > 100) {
            throw new BadRequestException('单次最多查询100个国家/地区')
        }
        const [countries, rates] = await Promise.all([
            this.findCountriesByKeyIds(uniqueKeyIds),
            this.database.builder(this.rateRepository, qb => {
                qb.select(['t.countryKeyId', 't.upUsd', 't.downUsd'])
                qb.where('t.countryKeyId IN (:...countryKeyIds)', { countryKeyIds: uniqueKeyIds })
                return qb.getMany()
            })
        ])
        const countryByKeyId = new Map(countries.map(country => [country.keyId, country]))
        return rates.flatMap(rate => {
            const country = countryByKeyId.get(rate.countryKeyId)
            if (!country) {
                return []
            }
            return [
                {
                    countryKeyId: country.keyId,
                    code: country.code,
                    mcc: country.mcc,
                    cnName: country.cnName,
                    enName: country.enName,
                    upUsd: rate.upUsd,
                    downUsd: rate.downUsd
                }
            ]
        })
    }

    /**按国家/地区主键获取单个短信基础价格摘要，供 Feign 使用；不存在或未配置价格时抛出 404*/
    public async findResolver(countryKeyId: number): Promise<feign.FinanceFrozenSmsSummary> {
        const [summary] = await this.findColumnResolver([countryKeyId])
        if (!summary) {
            throw new NotFoundException('该国家/地区未配置短信基础价格')
        }
        return summary
    }
}
