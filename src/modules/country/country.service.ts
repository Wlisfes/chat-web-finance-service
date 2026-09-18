import { Injectable } from '@nestjs/common'
import { CountrySelectResponseDto } from '@/dto/api-response.dto'
import { CountryUtilsService } from '@/modules/country/country.utils.service'
import * as CountryDto from '@/modules/country/dto/country.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import { PageResult, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class CountryService {
    constructor(
        @InjectRepository(Schema.TbFinanceCountry) private readonly countryRepository: Repository<Schema.TbFinanceCountry>,
        private readonly database: DataBaseService,
        private readonly countryUtilsService: CountryUtilsService
    ) {}

    /**国家地区分页数据*/
    public async httpBaseFinanceColumnCountry(body: CountryDto.ListCountryDto): Promise<PageResult<Schema.TbFinanceCountry>> {
        return this.database.builder(this.countryRepository, async qb => {
            if (isNotEmpty(body.cnName?.trim())) {
                qb.andWhere('(t.cnName LIKE :searchTerm OR t.enName LIKE :searchTerm OR t.code LIKE :searchTerm)', {
                    searchTerm: `%${body.cnName?.trim()}%`
                })
            }
            if (isNotEmpty(body.mcc?.trim())) {
                qb.andWhere('t.mcc LIKE :mcc', { mcc: `%${body.mcc?.trim()}%` })
            }
            if (isNotEmpty(body.status)) {
                qb.andWhere('t.status = :status', { status: body.status })
            }
            qb.orderBy('t.createTime', 'DESC')
                .skip((body.page - 1) * body.size)
                .take(body.size)
            const [list, total] = await qb.getManyAndCount()
            return { page: body.page, size: body.size, total, list }
        })
    }

    /**编辑国家地区状态*/
    public async httpBaseFinanceUpdateCountryStatus(body: CountryDto.UpdateCountryStatusDto): Promise<Schema.TbFinanceCountry> {
        return this.countryRepository.manager.transaction(async manager => {
            const country = await this.countryUtilsService.findRequired(body.keyId, manager)
            country.status = body.status
            return manager.save(country)
        })
    }

    /**国家地区下拉数据*/
    public async httpBaseFinanceSelectCountry(): Promise<CountrySelectResponseDto> {
        const items = await this.database.builder(this.countryRepository, qb => {
            return qb
                .where('t.status = :status', { status: Schema.TbFinanceCountryStatus.ENABLE })
                .orderBy('t.createTime', 'DESC')
                .getMany()
        })
        return { list: items.map(item => ({ ...item, showName: `${item.cnName} -${item.enName}` })) }
    }
}
