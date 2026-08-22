import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceBasicSmsRate, TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { In, Repository } from 'typeorm'
import { BatchSmsRateDto, CreateSmsRateDto, ListSmsRateDto, UpdateSmsRateDto } from '@/modules/sms-rate/dto/sms-rate.dto'

@Injectable()
export class SmsRateService {
    constructor(
        @InjectRepository(TbFinanceBasicSmsRate) private readonly repository: Repository<TbFinanceBasicSmsRate>,
        @InjectRepository(TbFinanceCountry) private readonly countryRepository: Repository<TbFinanceCountry>
    ) {}

    async create(actorUid: string, input: CreateSmsRateDto) {
        await this.assertAvailable(input.code, input.mcc)
        return this.repository.save(this.repository.create({ ...input, createBy: actorUid, modifyBy: actorUid }))
    }

    async update(actorUid: string, input: UpdateSmsRateDto) {
        const rate = await this.findRequired(input.keyId)
        await this.assertAvailable(input.code, input.mcc, input.keyId)
        this.repository.merge(rate, input, { modifyBy: actorUid })
        return this.repository.save(rate)
    }

    async list(input: ListSmsRateDto) {
        const query = this.repository.createQueryBuilder('rate')
        if (input.code?.trim()) query.andWhere('rate.code LIKE :code', { code: `%${input.code.trim()}%` })
        if (input.mcc?.trim()) query.andWhere('rate.mcc LIKE :mcc', { mcc: `%${input.mcc.trim()}%` })
        query
            .orderBy('rate.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [rates, total] = await query.getManyAndCount()
        const countries = rates.length
            ? await this.countryRepository.find({ where: { code: In([...new Set(rates.map(rate => rate.code))]) } })
            : []
        const countriesByCode = new Map(countries.map(country => [country.code, country]))
        return {
            page: input.page,
            size: input.size,
            total,
            list: rates.map(rate => ({
                ...rate,
                countryOptions: countriesByCode.get(rate.code),
                createByOptions: rate.createBy ? { uid: rate.createBy } : undefined,
                modifyByOptions: rate.modifyBy ? { uid: rate.modifyBy } : undefined
            }))
        }
    }

    async batch(input: BatchSmsRateDto) {
        const countryKeyIds = [...new Set(input.countryKeyIds)]
        const countries = await this.countryRepository.find({ where: { keyId: In(countryKeyIds) } })
        if (countries.length !== countryKeyIds.length) throw new BadRequestException('部分国家/地区不存在')
        const rates = await this.repository.find({
            where: countries.map(country => ({ code: country.code, mcc: country.mcc }))
        })
        const rateByCountry = new Map(rates.map(rate => [`${rate.code}:${rate.mcc}`, rate]))
        const missingCountries = countries.filter(country => !rateByCountry.has(`${country.code}:${country.mcc}`))
        if (missingCountries.length) {
            throw new BadRequestException(
                `以下国家/地区尚未配置短信基础价格：${missingCountries.map(country => country.cnName).join('、')}`
            )
        }
        const countryByKeyId = new Map(countries.map(country => [country.keyId, country]))
        return countryKeyIds.map(countryKeyId => {
            const country = countryByKeyId.get(countryKeyId)!
            return { ...country, ...rateByCountry.get(`${country.code}:${country.mcc}`), countryKeyId: country.keyId }
        })
    }

    private async findRequired(keyId: number) {
        const rate = await this.repository.findOneBy({ keyId })
        if (!rate) throw new NotFoundException('短信基础价格不存在')
        return rate
    }

    private async assertAvailable(code: string, mcc: string, excludedKeyId?: number) {
        const query = this.repository.createQueryBuilder('rate').where('rate.code = :code AND rate.mcc = :mcc', { code, mcc })
        if (excludedKeyId) query.andWhere('rate.keyId <> :excludedKeyId', { excludedKeyId })
        if (await query.getExists()) throw new ConflictException('该国家/地区的移动代码已配置过价格')
    }
}
