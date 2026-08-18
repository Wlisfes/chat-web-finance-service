import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCountry, TbFinanceCountryStatus } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { Repository } from 'typeorm'
import { ListCountryDto, UpdateCountryStatusDto } from '@/modules/country/dto/country.dto'

@Injectable()
export class CountryService {
    constructor(@InjectRepository(TbFinanceCountry) private readonly repository: Repository<TbFinanceCountry>) {}

    async list(input: ListCountryDto) {
        const query = this.repository.createQueryBuilder('country')
        if (input.cnName?.trim()) {
            query.andWhere('(country.cnName LIKE :keyword OR country.enName LIKE :keyword OR country.code LIKE :keyword)', {
                keyword: `%${input.cnName.trim()}%`
            })
        }
        if (input.mcc?.trim()) query.andWhere('country.mcc LIKE :mcc', { mcc: `%${input.mcc.trim()}%` })
        if (input.status) query.andWhere('country.status = :status', { status: input.status })
        query
            .orderBy('country.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [list, total] = await query.getManyAndCount()
        return { page: input.page, size: input.size, total, list }
    }

    async updateStatus(input: UpdateCountryStatusDto) {
        const country = await this.repository.findOneBy({ keyId: input.keyId })
        if (!country) throw new NotFoundException('国家/地区不存在')
        country.status = input.status
        return this.repository.save(country)
    }

    async select() {
        const items = await this.repository.find({ where: { status: TbFinanceCountryStatus.ENABLE }, order: { createTime: 'DESC' } })
        return { list: items.map(item => ({ ...item, showName: `${item.cnName} -${item.enName}` })) }
    }
}
