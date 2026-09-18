import { Injectable, NotFoundException } from '@nestjs/common'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, EntityManager, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class CountryUtilsService {
    constructor(
        @InjectRepository(Schema.TbFinanceCountry) private readonly countryRepository: Repository<Schema.TbFinanceCountry>,
        private readonly database: DataBaseService
    ) {}

    /**获取国家地区详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbFinanceCountry> {
        const repository = (manager ?? this.countryRepository.manager).getRepository(Schema.TbFinanceCountry)
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
