import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import { CurrencyUtilsService } from '@/modules/currency/currency.utils.service'
import * as CurrencyDto from '@/modules/currency/dto/currency.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import { PageResult, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class CurrencyService {
    constructor(
        @InjectRepository(Schema.TbFinanceCurrency) private readonly currencyRepository: Repository<Schema.TbFinanceCurrency>,
        @InjectRepository(Schema.TbFinanceCurrencyExchange)
        private readonly exchangeRepository: Repository<Schema.TbFinanceCurrencyExchange>,
        private readonly database: DataBaseService,
        private readonly currencyUtilsService: CurrencyUtilsService,
        private readonly accountFeignClient: feign.FeignClientAccountManager,
        private readonly configService: ConfigService
    ) {}

    /**币种静态枚举*/
    public async httpBaseFinanceCurrencyEnums(): Promise<CurrencyDto.CurrencyEnumsResponseDto> {
        return {
            statusOptions: Schema.TbFinanceCurrencyStatusDefinition.options
        }
    }

    /**币种分页数据*/
    public async httpBaseFinanceColumnCurrency(
        body: CurrencyDto.ListCurrencyDto
    ): Promise<PageResult<CurrencyDto.CurrencyListItemResponseDto>> {
        return this.database.builder(this.currencyRepository, async qb => {
            if (isNotEmpty(body.name?.trim())) {
                qb.andWhere('t.name LIKE :name', { name: `%${body.name?.trim()}%` })
            }
            if (isNotEmpty(body.status)) {
                qb.andWhere('t.status = :status', { status: body.status })
            }
            qb.orderBy('t.createTime', 'DESC')
            qb.skip((body.page - 1) * body.size)
            qb.take(body.size)
            return await qb.getManyAndCount().then(async ([items, total]) => {
                // 操作人姓名属于展示元数据，使用服务间凭据按列表批量还原。
                const list = await feign.appendAccountUserOptions(this.accountFeignClient, this.configService, items, [
                    'createBy',
                    'modifyBy'
                ])
                return { page: body.page, size: body.size, total, list }
            })
        })
    }

    /**编辑币种状态*/
    public async httpBaseFinanceUpdateCurrencyStatus(
        principal: AuthPrincipal,
        body: CurrencyDto.UpdateCurrencyStatusDto
    ): Promise<Schema.TbFinanceCurrency> {
        return this.currencyRepository.manager.transaction(async manager => {
            const currency = await this.currencyUtilsService.findRequired(body.keyId, manager)
            currency.status = body.status
            currency.modifyBy = principal.uid
            return manager.save(currency)
        })
    }

    /**币种下拉数据*/
    public async httpBaseFinanceSelectCurrency(): Promise<CurrencyDto.CurrencySelectResponseDto> {
        return await this.database.builder(this.currencyRepository, qb => {
            qb.where('t.status = :status', { status: Schema.TbFinanceCurrencyStatus.ENABLE })
            qb.orderBy('t.createTime', 'DESC')
            qb.getMany()
            return qb.getMany().then(list => ({ list }))
        })
    }

    /**汇率分页数据*/
    public async httpBaseFinanceColumnCurrencyExchange(
        body: CurrencyDto.ListCurrencyExchangeDto
    ): Promise<PageResult<CurrencyDto.CurrencyExchangeListItemResponseDto>> {
        return this.database.builder(this.exchangeRepository, async qb => {
            if (isNotEmpty(body.currency?.trim())) {
                qb.andWhere('t.currency = :currency', { currency: body.currency?.trim() })
            }
            if (isNotEmpty(body.date)) {
                qb.andWhere('t.rateDate = :date', { date: body.date })
            }
            qb.orderBy('t.rateDate', 'DESC')
            qb.addOrderBy('t.currency', 'ASC')
            qb.skip((body.page - 1) * body.size)
            qb.take(body.size)
            return await qb.getManyAndCount().then(([items, total]) => {
                return { page: body.page, size: body.size, total, list: items.map(item => ({ ...item, date: item.rateDate })) }
            })
        })
    }

    /**汇率详情*/
    public async httpBaseFinanceResolverCurrencyExchange(
        query: CurrencyDto.ResolveCurrencyExchangeDto
    ): Promise<CurrencyDto.CurrencyExchangeResponseDto> {
        const normalizedCurrency = query.currency.trim().toUpperCase()
        const currentDate = new Date().toISOString().slice(0, 10)
        if (normalizedCurrency === 'USD') {
            return { currency: 'USD', rate: 1, rateDate: currentDate, date: currentDate }
        }
        const exchange = await this.currencyUtilsService.findExchangeRequired(normalizedCurrency)
        return { ...exchange, date: exchange.rateDate }
    }
}
