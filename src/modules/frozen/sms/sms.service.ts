import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import * as utils from '@wlisfes/chat-web-base-schema/utils'
import { FrozenSmsUtilsService } from '@/modules/frozen/sms/sms.utils.service'
import * as SmsDto from '@/modules/frozen/sms/dto/sms.dto'
import * as SmsConstants from '@/modules/frozen/sms/sms.constants'
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

    /**短信基础价格静态枚举*/
    public async httpBaseFinanceFrozenSmsEnums(): Promise<SmsDto.FrozenSmsEnumsResponseDto> {
        return {
            modeOptions: SmsConstants.FrozenSmsFluctuateModeDefinition.options
        }
    }

    /**短信基础价格详情*/
    public async httpBaseFinanceFrozenSmsResolver(query: SmsDto.FrozenSmsKeyDto): Promise<SmsDto.FrozenSmsResponseDto> {
        return this.frozenSmsUtilsService.fetchUsdRate(await this.frozenSmsUtilsService.findRequired(query.keyId))
    }

    /**新增短信基础价格*/
    public async httpBaseFinanceCreateFrozenSms(
        principal: AuthPrincipal,
        body: SmsDto.CreateFrozenSmsDto
    ): Promise<SmsDto.FrozenSmsResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const [country] = await this.frozenSmsUtilsService.findCountriesRequired([body.countryKeyId])
            await this.frozenSmsUtilsService.findAvailable(body.countryKeyId, manager)
            const rate = manager.create(Schema.TbFinanceFrozenSms, {
                ...body,
                upUsd: this.frozenSmsUtilsService.fetchStoragePrice(body.upUsd),
                downUsd: this.frozenSmsUtilsService.fetchStoragePrice(body.downUsd),
                code: country.code,
                mcc: country.mcc,
                createBy: principal.uid,
                modifyBy: principal.uid
            })
            return this.frozenSmsUtilsService.fetchUsdRate(await manager.save(rate))
        })
    }

    /**编辑短信基础价格*/
    public async httpBaseFinanceUpdateFrozenSms(
        principal: AuthPrincipal,
        body: SmsDto.UpdateFrozenSmsDto
    ): Promise<SmsDto.FrozenSmsResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const rate = await this.frozenSmsUtilsService.findRequired(body.keyId, manager)
            const [country] = await this.frozenSmsUtilsService.findCountriesRequired([body.countryKeyId])
            await this.frozenSmsUtilsService.findAvailable(body.countryKeyId, manager, body.keyId)
            manager.merge(Schema.TbFinanceFrozenSms, rate, {
                ...body,
                upUsd: this.frozenSmsUtilsService.fetchStoragePrice(body.upUsd),
                downUsd: this.frozenSmsUtilsService.fetchStoragePrice(body.downUsd),
                code: country.code,
                mcc: country.mcc,
                modifyBy: principal.uid
            })
            return this.frozenSmsUtilsService.fetchUsdRate(await manager.save(rate))
        })
    }

    /**批量上调、下调短信基础价格：全部记录在同一事务内计算后统一保存，任一价格小于 0 时整批拒绝*/
    public async httpBaseFinanceFluctuateFrozenSms(
        principal: AuthPrincipal,
        body: SmsDto.FluctuateFrozenSmsDto
    ): Promise<SmsDto.FluctuateFrozenSmsResponseDto> {
        const rule = SmsConstants.FrozenSmsFluctuateRules[body.mode]
        this.frozenSmsUtilsService.findFluctuateValueRequired([body.upValue, body.downValue], rule)
        return this.repository.manager.transaction(async manager => {
            const rates = await this.frozenSmsUtilsService.findListRequired(body.countryKeyIds, manager)
            for (const rate of rates) {
                const upUsd = this.frozenSmsUtilsService.fetchFluctuatePrice(rate.upUsd, body.upValue, rule)
                const downUsd = this.frozenSmsUtilsService.fetchFluctuatePrice(rate.downUsd, body.downValue, rule)
                if (upUsd < 0 || downUsd < 0) {
                    throw new BadRequestException(`MCC ${rate.mcc} 调整后价格小于0，请调小下调幅度`)
                }
                manager.merge(Schema.TbFinanceFrozenSms, rate, { upUsd, downUsd, modifyBy: principal.uid })
            }
            await manager.save(rates)
            return { count: rates.length }
        })
    }

    /**短信基础价格分页数据*/
    public async httpBaseFinanceColumnFrozenSms(
        body: SmsDto.ListFrozenSmsDto
    ): Promise<utils.PageResult<SmsDto.FrozenSmsListItemResponseDto>> {
        const { page, size } = utils.fetchUntiePagination(body)
        return this.database.builder(this.repository, async qb => {
            if (utils.isNotEmpty(body.countryKeyId)) {
                qb.andWhere('t.countryKeyId = :countryKeyId', { countryKeyId: body.countryKeyId })
            }
            if (utils.isNotEmpty(body.mcc?.trim())) {
                qb.andWhere('t.mcc LIKE :mcc', { mcc: `%${body.mcc?.trim()}%` })
            }
            qb.orderBy('t.createTime', 'DESC')
            qb.skip((page - 1) * size)
            qb.take(size)
            return await qb.getManyAndCount().then(async ([rates, total]) => {
                const countries = await this.frozenSmsUtilsService.findCountriesByKeyIds(rates.map(rate => rate.countryKeyId))
                const countryByKeyId = new Map(countries.map(country => [country.keyId, country]))
                const items = rates.map(rate => ({
                    ...this.frozenSmsUtilsService.fetchUsdRate(rate),
                    countryOptions: countryByKeyId.get(rate.countryKeyId)
                }))
                return utils.fetchResolver({
                    page,
                    size,
                    total,
                    list: await feign.appendAccountUserOptions(this.accountFeignClient, this.configService, items, ['createBy', 'modifyBy'])
                })
            })
        })
    }
}
