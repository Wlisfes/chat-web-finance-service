import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import * as utils from '@wlisfes/chat-web-base-schema/utils'
import { FrozenSimbankUtilsService } from '@/modules/frozen/simbank/simbank.utils.service'
import * as SimbankDto from '@/modules/frozen/simbank/dto/simbank.dto'
import * as SmsConstants from '@/modules/frozen/sms/sms.constants'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as Schema from '@wlisfes/chat-web-base-schema'

@Injectable()
export class FrozenSimbankService {
    constructor(
        @InjectRepository(Schema.TbFinanceFrozenSimbank) private readonly repository: Repository<Schema.TbFinanceFrozenSimbank>,
        private readonly database: DataBaseService,
        private readonly frozenSimbankUtilsService: FrozenSimbankUtilsService,
        private readonly skylineFeignClient: feign.FeignClientSkylineManager,
        private readonly configService: ConfigService
    ) {}

    /**simbank 基础成本价格静态枚举*/
    public async httpBaseFinanceFrozenSimbankEnums(): Promise<SimbankDto.FrozenSimbankEnumsResponseDto> {
        return {
            modeOptions: SmsConstants.FrozenSmsFluctuateModeDefinition.options
        }
    }

    /**simbank 基础成本价格详情*/
    public async httpBaseFinanceFrozenSimbankResolver(query: SimbankDto.FrozenSimbankKeyDto): Promise<SimbankDto.FrozenSimbankResponseDto> {
        return this.frozenSimbankUtilsService.fetchUsdRate(await this.frozenSimbankUtilsService.findRequired(query.keyId))
    }

    /**新增simbank 基础成本价格*/
    public async httpBaseFinanceCreateFrozenSimbank(
        principal: AuthPrincipal,
        body: SimbankDto.CreateFrozenSimbankDto
    ): Promise<SimbankDto.FrozenSimbankResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const [country] = await this.frozenSimbankUtilsService.findCountriesRequired([body.countryKeyId])
            await this.frozenSimbankUtilsService.findAvailable(body.countryKeyId, manager)
            const rate = manager.create(Schema.TbFinanceFrozenSimbank, {
                ...body,
                upUsd: this.frozenSimbankUtilsService.fetchStoragePrice(body.upUsd),
                downUsd: this.frozenSimbankUtilsService.fetchStoragePrice(body.downUsd),
                code: country.code,
                mcc: country.mcc,
                createBy: principal.uid,
                modifyBy: principal.uid
            })
            return this.frozenSimbankUtilsService.fetchUsdRate(await manager.save(rate))
        })
    }

    /**编辑simbank 基础成本价格*/
    public async httpBaseFinanceUpdateFrozenSimbank(
        principal: AuthPrincipal,
        body: SimbankDto.UpdateFrozenSimbankDto
    ): Promise<SimbankDto.FrozenSimbankResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const rate = await this.frozenSimbankUtilsService.findRequired(body.keyId, manager)
            const [country] = await this.frozenSimbankUtilsService.findCountriesRequired([body.countryKeyId])
            await this.frozenSimbankUtilsService.findAvailable(body.countryKeyId, manager, body.keyId)
            manager.merge(Schema.TbFinanceFrozenSimbank, rate, {
                ...body,
                upUsd: this.frozenSimbankUtilsService.fetchStoragePrice(body.upUsd),
                downUsd: this.frozenSimbankUtilsService.fetchStoragePrice(body.downUsd),
                code: country.code,
                mcc: country.mcc,
                modifyBy: principal.uid
            })
            return this.frozenSimbankUtilsService.fetchUsdRate(await manager.save(rate))
        })
    }

    /**批量上调、下调simbank 基础成本价格：全部记录在同一事务内计算后统一保存，任一价格小于 0 时整批拒绝*/
    public async httpBaseFinanceFluctuateFrozenSimbank(
        principal: AuthPrincipal,
        body: SimbankDto.FluctuateFrozenSimbankDto
    ): Promise<SimbankDto.FluctuateFrozenSimbankResponseDto> {
        const rule = SmsConstants.FrozenSmsFluctuateRules[body.mode]
        this.frozenSimbankUtilsService.findFluctuateValueRequired([body.upValue, body.downValue], rule)
        return this.repository.manager.transaction(async manager => {
            const rates = await this.frozenSimbankUtilsService.findListRequired(body.countryKeyIds, manager)
            for (const rate of rates) {
                const upUsd = this.frozenSimbankUtilsService.fetchFluctuatePrice(rate.upUsd, body.upValue, rule)
                const downUsd = this.frozenSimbankUtilsService.fetchFluctuatePrice(rate.downUsd, body.downValue, rule)
                if (upUsd < 0 || downUsd < 0) {
                    throw new BadRequestException(`MCC ${rate.mcc} 调整后价格小于0，请调小下调幅度`)
                }
                manager.merge(Schema.TbFinanceFrozenSimbank, rate, { upUsd, downUsd, modifyBy: principal.uid })
            }
            await manager.save(rates)
            return { count: rates.length }
        })
    }

    /**simbank 基础成本价格分页数据*/
    public async httpBaseFinanceColumnFrozenSimbank(
        body: SimbankDto.ListFrozenSimbankDto
    ): Promise<utils.PageResult<SimbankDto.FrozenSimbankListItemResponseDto>> {
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
                const countries = await this.frozenSimbankUtilsService.findCountriesByKeyIds(rates.map(rate => rate.countryKeyId))
                const countryByKeyId = new Map(countries.map(country => [country.keyId, country]))
                const items = rates.map(rate => ({
                    ...this.frozenSimbankUtilsService.fetchUsdRate(rate),
                    countryOptions: countryByKeyId.get(rate.countryKeyId)
                }))
                return utils.fetchResolver({
                    page,
                    size,
                    total,
                    list: await feign.fetchAppendSkylineUserOptions(this.skylineFeignClient, this.configService, items, [
                        'createBy',
                        'modifyBy'
                    ])
                })
            })
        })
    }
}
