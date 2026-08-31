import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceCountry } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from 'class-validator'
import { EntityManager, Repository } from 'typeorm'

@Injectable()
export class CountryUtilsService {
    constructor(
        @InjectRepository(TbFinanceCountry) private readonly countryRepository: Repository<TbFinanceCountry>,
        private readonly database: DataBaseService
    ) {}

    /**获取国家地区详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbFinanceCountry> {
        const repository = (manager ?? this.countryRepository.manager).getRepository(TbFinanceCountry)
        const country = await this.database.builder(repository, qb => {
            qb.where('t.keyId = :keyId', { keyId })
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getOne()
        })
        if (!country) {
            throw new NotFoundException('国家/地区不存在')
        }
        return country
    }
}
