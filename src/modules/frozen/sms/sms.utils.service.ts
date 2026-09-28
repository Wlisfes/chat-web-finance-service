import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository, DataBaseService, EntityManager, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
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

    /**获取指定国家地区的短信基础价格*/
    public async findRatesRequired(countries: Schema.TbFinanceCountry[]): Promise<Schema.TbFinanceFrozenSms[]> {
        const rates = await this.database.builder(this.rateRepository, qb => {
            return qb.where('t.countryKeyId IN (:...countryKeyIds)', { countryKeyIds: countries.map(country => country.keyId) }).getMany()
        })
        const rateByCountry = new Map(rates.map(rate => [rate.countryKeyId, rate]))
        const missingCountries = countries.filter(country => !rateByCountry.has(country.keyId))
        if (missingCountries.length > 0) {
            throw new BadRequestException(
                `以下国家/地区尚未配置短信基础价格：${missingCountries.map(country => country.cnName).join('、')}`
            )
        }
        return rates
    }
}
