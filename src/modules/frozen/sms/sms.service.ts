import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import { PageResult, isNotEmpty, fetchUntiePagination, fetchResolver } from '@wlisfes/chat-web-base-schema/utils'
import { FrozenSmsUtilsService } from '@/modules/frozen/sms/sms.utils.service'
import * as SmsDto from '@/modules/frozen/sms/dto/sms.dto'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

@Injectable()
export class FrozenSmsService {
    constructor(
        @InjectRepository(Schema.TbFinanceFrozenSms) private readonly repository: Repository<Schema.TbFinanceFrozenSms>,
        private readonly database: DataBaseService,
        private readonly frozenSmsUtilsService: FrozenSmsUtilsService,
        private readonly accountFeignClient: feign.FeignClientAccountManager,
        private readonly configService: ConfigService
    ) {}

    /**新增短信基础价格*/
    public async httpBaseFinanceCreateFrozenSms(
        principal: AuthPrincipal,
        body: SmsDto.CreateFrozenSmsDto
    ): Promise<Schema.TbFinanceFrozenSms> {
        return this.repository.manager.transaction(async manager => {
            await this.frozenSmsUtilsService.findAvailable(body.code, body.mcc, manager)
            const rate = manager.create(Schema.TbFinanceFrozenSms, { ...body, createBy: principal.uid, modifyBy: principal.uid })
            return manager.save(rate)
        })
    }

    /**编辑短信基础价格*/
    public async httpBaseFinanceUpdateFrozenSms(
        principal: AuthPrincipal,
        body: SmsDto.UpdateFrozenSmsDto
    ): Promise<Schema.TbFinanceFrozenSms> {
        return this.repository.manager.transaction(async manager => {
            const rate = await this.frozenSmsUtilsService.findRequired(body.keyId, manager)
            await this.frozenSmsUtilsService.findAvailable(body.code, body.mcc, manager, body.keyId)
            manager.merge(Schema.TbFinanceFrozenSms, rate, { ...body, modifyBy: principal.uid })
            return manager.save(rate)
        })
    }

    /**短信基础价格分页数据*/
    public async httpBaseFinanceColumnFrozenSms(body: SmsDto.ListFrozenSmsDto): Promise<PageResult<SmsDto.FrozenSmsListItemResponseDto>> {
        const { page, size } = fetchUntiePagination(body)
        return this.database.builder(this.repository, async qb => {
            if (isNotEmpty(body.code?.trim())) {
                qb.andWhere('t.code LIKE :code', { code: `%${body.code?.trim()}%` })
            }
            if (isNotEmpty(body.mcc?.trim())) {
                qb.andWhere('t.mcc LIKE :mcc', { mcc: `%${body.mcc?.trim()}%` })
            }
            qb.orderBy('t.createTime', 'DESC')
            qb.skip((page - 1) * size)
            qb.take(size)
            return await qb.getManyAndCount().then(async ([rates, total]) => {
                const countries = await this.frozenSmsUtilsService.findCountriesByCodes(rates.map(rate => rate.code))
                const countriesByCode = new Map(countries.map(country => [country.code, country]))
                const items = rates.map(rate => ({ ...rate, countryOptions: countriesByCode.get(rate.code) }))
                return fetchResolver({
                    page,
                    size,
                    total,
                    list: await feign.appendAccountUserOptions(this.accountFeignClient, this.configService, items, ['createBy', 'modifyBy'])
                })
            })
        })
    }

    /**按国家地区批量获取短信基础价格*/
    public async httpBaseFinanceBatchFrozenSms(body: SmsDto.BatchFrozenSmsDto): Promise<SmsDto.BatchFrozenSmsResponseDto[]> {
        const countryKeyIds = [...new Set(body.countryKeyIds)]
        const countries = await this.frozenSmsUtilsService.findCountriesRequired(countryKeyIds)
        const rates = await this.frozenSmsUtilsService.findRatesRequired(countries)
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
