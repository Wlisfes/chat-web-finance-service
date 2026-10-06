import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository, DataBaseService, EntityManager, Repository } from '@wlisfes/chat-web-base-schema/database'
import { FeignClientCrmManager } from '@wlisfes/chat-web-base-schema/feign'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import * as Schema from '@wlisfes/chat-web-base-schema'

@Injectable()
export class BrandUtilsService {
    constructor(
        @InjectRepository(Schema.TbFinanceBrand) private readonly brandRepository: Repository<Schema.TbFinanceBrand>,
        private readonly database: DataBaseService
    ) {}

    /**获取品牌详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbFinanceBrand> {
        const repository = (manager ?? this.brandRepository.manager).getRepository(Schema.TbFinanceBrand)
        const brand = await this.database.builder(repository, qb => {
            qb.where('t.keyId = :keyId', { keyId })
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getOne()
        })
        if (!brand) {
            throw new NotFoundException('品牌不存在')
        }
        return brand
    }

    /**校验品牌名称*/
    public async findNameAvailable(name: string, manager?: EntityManager, excludedKeyId?: number): Promise<void> {
        const repository = (manager ?? this.brandRepository.manager).getRepository(Schema.TbFinanceBrand)
        const exists = await this.database.builder(repository, qb => {
            qb.where('t.name = :name', { name: name.trim() })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('品牌名称已存在')
        }
    }

    /**校验品牌未被 CRM 客户引用*/
    public async findUnusedRequired(keyId: number, crmFeignClient: FeignClientCrmManager, authorization: string): Promise<void> {
        const result = await crmFeignClient.httpBaseCrmColumnConsumer(authorization, { page: 1, size: 1, brandKeyId: keyId })
        if ((result.total ?? 0) > 0) {
            throw new BadRequestException('品牌已被客户使用，不能删除')
        }
    }
}
