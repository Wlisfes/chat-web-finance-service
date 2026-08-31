import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceBasicSmsRate, TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from 'class-validator'
import { EntityManager, Repository } from 'typeorm'

@Injectable()
export class SmsRateUtilsService {
    constructor(
        @InjectRepository(TbFinanceBasicSmsRate) private readonly rateRepository: Repository<TbFinanceBasicSmsRate>,
        @InjectRepository(TbFinanceCountry) private readonly countryRepository: Repository<TbFinanceCountry>,
        private readonly database: DataBaseService
    ) {}

    /**获取短信基础价格详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbFinanceBasicSmsRate> {
        const repository = (manager ?? this.rateRepository.manager).getRepository(TbFinanceBasicSmsRate)
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

    /**校验国家地区移动代码价格*/
    public async findAvailable(code: string, mcc: string, manager?: EntityManager, excludedKeyId?: number): Promise<void> {
        const repository = (manager ?? this.rateRepository.manager).getRepository(TbFinanceBasicSmsRate)
        const exists = await this.database.builder(repository, qb => {
            qb.where('t.code = :code AND t.mcc = :mcc', { code, mcc })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('该国家/地区的移动代码已配置过价格')
        }
    }

    /**按区号获取国家地区*/
    public async findCountriesByCodes(codes: string[]): Promise<TbFinanceCountry[]> {
        const uniqueCodes = [...new Set(codes)]
        if (uniqueCodes.length === 0) {
            return []
        }
        return this.database.builder(this.countryRepository, qb => qb.where('t.code IN (:...codes)', { codes: uniqueCodes }).getMany())
    }

    /**获取指定国家地区*/
    public async findCountriesRequired(countryKeyIds: number[]): Promise<TbFinanceCountry[]> {
        const countries = await this.database.builder(this.countryRepository, qb => {
            return qb.where('t.keyId IN (:...countryKeyIds)', { countryKeyIds }).getMany()
        })
        if (countries.length !== countryKeyIds.length) {
            throw new BadRequestException('部分国家/地区不存在')
        }
        return countries
    }

    /**获取指定国家地区的短信基础价格*/
    public async findRatesRequired(countries: TbFinanceCountry[]): Promise<TbFinanceBasicSmsRate[]> {
        const rates = await this.database.builder(this.rateRepository, qb => {
            return qb.where(countries.map(country => ({ code: country.code, mcc: country.mcc }))).getMany()
        })
        const rateByCountry = new Map(rates.map(rate => [`${rate.code}:${rate.mcc}`, rate]))
        const missingCountries = countries.filter(country => !rateByCountry.has(`${country.code}:${country.mcc}`))
        if (missingCountries.length > 0) {
            throw new BadRequestException(
                `以下国家/地区尚未配置短信基础价格：${missingCountries.map(country => country.cnName).join('、')}`
            )
        }
        return rates
    }
}
