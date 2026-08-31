import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { TbFinanceBasicSmsRate } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { BatchSmsRateResponseDto, SmsRateListItemResponseDto } from '@/dto/api-response.dto'
import { SmsRateUtilsService } from '@/modules/sms-rate/sms-rate.utils.service'
import * as SmsRateDto from '@/modules/sms-rate/dto/sms-rate.dto'

@Injectable()
export class SmsRateService {
    constructor(
        @InjectRepository(TbFinanceBasicSmsRate) private readonly repository: Repository<TbFinanceBasicSmsRate>,
        private readonly database: DataBaseService,
        private readonly smsRateUtilsService: SmsRateUtilsService
    ) {}

    /**新增短信基础价格*/
    public async httpBaseFinanceCreateSmsRate(principal: AuthPrincipal, body: SmsRateDto.CreateSmsRateDto): Promise<TbFinanceBasicSmsRate> {
        return this.repository.manager.transaction(async manager => {
            await this.smsRateUtilsService.findAvailable(body.code, body.mcc, manager)
            const rate = manager.create(TbFinanceBasicSmsRate, { ...body, createBy: principal.uid, modifyBy: principal.uid })
            return manager.save(rate)
        })
    }

    /**编辑短信基础价格*/
    public async httpBaseFinanceUpdateSmsRate(principal: AuthPrincipal, body: SmsRateDto.UpdateSmsRateDto): Promise<TbFinanceBasicSmsRate> {
        return this.repository.manager.transaction(async manager => {
            const rate = await this.smsRateUtilsService.findRequired(body.keyId, manager)
            await this.smsRateUtilsService.findAvailable(body.code, body.mcc, manager, body.keyId)
            manager.merge(TbFinanceBasicSmsRate, rate, { ...body, modifyBy: principal.uid })
            return manager.save(rate)
        })
    }

    /**短信基础价格分页数据*/
    public async httpBaseFinanceColumnSmsRate(body: SmsRateDto.ListSmsRateDto): Promise<PageResult<SmsRateListItemResponseDto>> {
        return this.database.builder(this.repository, async qb => {
            if (isNotEmpty(body.code?.trim())) {
                qb.andWhere('t.code LIKE :code', { code: `%${body.code?.trim()}%` })
            }
            if (isNotEmpty(body.mcc?.trim())) {
                qb.andWhere('t.mcc LIKE :mcc', { mcc: `%${body.mcc?.trim()}%` })
            }
            qb.orderBy('t.createTime', 'DESC')
                .skip((body.page - 1) * body.size)
                .take(body.size)
            const [rates, total] = await qb.getManyAndCount()
            const countries = await this.smsRateUtilsService.findCountriesByCodes(rates.map(rate => rate.code))
            const countriesByCode = new Map(countries.map(country => [country.code, country]))
            return {
                page: body.page,
                size: body.size,
                total,
                list: rates.map(rate => ({
                    ...rate,
                    countryOptions: countriesByCode.get(rate.code),
                    createByOptions: isNotEmpty(rate.createBy) ? { uid: rate.createBy } : undefined,
                    modifyByOptions: isNotEmpty(rate.modifyBy) ? { uid: rate.modifyBy } : undefined
                }))
            }
        })
    }

    /**按国家地区批量获取短信基础价格*/
    public async httpBaseFinanceBatchSmsRate(body: SmsRateDto.BatchSmsRateDto): Promise<BatchSmsRateResponseDto[]> {
        const countryKeyIds = [...new Set(body.countryKeyIds)]
        const countries = await this.smsRateUtilsService.findCountriesRequired(countryKeyIds)
        const rates = await this.smsRateUtilsService.findRatesRequired(countries)
        const rateByCountry = new Map(rates.map(rate => [`${rate.code}:${rate.mcc}`, rate]))
        const countryByKeyId = new Map(countries.map(country => [country.keyId, country]))
        return countryKeyIds.map(countryKeyId => {
            const country = countryByKeyId.get(countryKeyId)
            if (!country) {
                throw new BadRequestException('部分国家/地区不存在')
            }
            const rate = rateByCountry.get(`${country.code}:${country.mcc}`)
            if (!rate) {
                throw new BadRequestException(`以下国家/地区尚未配置短信基础价格：${country.cnName}`)
            }
            return { ...country, ...rate, countryKeyId: country.keyId }
        })
    }
}
