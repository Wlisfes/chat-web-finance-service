import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { BrandUtilsService } from '@/modules/brand/brand.utils.service'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as BrandDto from '@/modules/brand/dto/brand.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { InjectRepository, DataBaseService, Repository } from '@wlisfes/chat-web-base-schema/database'
import { PageResult, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
@Injectable()
export class BrandService {
    constructor(
        @InjectRepository(Schema.TbFinanceBrand) private readonly brandRepository: Repository<Schema.TbFinanceBrand>,
        private readonly database: DataBaseService,
        private readonly brandUtilsService: BrandUtilsService,
        private readonly accountFeignClient: feign.FeignClientAccountManager,
        private readonly crmFeignClient: feign.FeignClientCrmManager,
        private readonly configService: ConfigService
    ) {}

    /**品牌静态枚举*/
    public async httpBaseFinanceBrandEnums(): Promise<BrandDto.BrandEnumsResponseDto> {
        return {
            statusOptions: Schema.TbFinanceBrandStatusDefinition.options
        }
    }

    /**品牌详情*/
    public async httpBaseFinanceBrandResolver(query: BrandDto.BrandKeyDto): Promise<Schema.TbFinanceBrand> {
        return this.brandUtilsService.findRequired(query.keyId)
    }

    /**新增品牌*/
    public async httpBaseFinanceCreateBrand(principal: AuthPrincipal, body: BrandDto.CreateBrandDto): Promise<Schema.TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            await this.brandUtilsService.findNameAvailable(body.name, manager)
            const brand = manager.create(Schema.TbFinanceBrand, { ...body, createBy: principal.uid, modifyBy: principal.uid })
            return manager.save(brand)
        })
    }

    /**编辑品牌*/
    public async httpBaseFinanceUpdateBrand(principal: AuthPrincipal, body: BrandDto.UpdateBrandDto): Promise<Schema.TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            const brand = await this.brandUtilsService.findRequired(body.keyId, manager)
            await this.brandUtilsService.findNameAvailable(body.name, manager, body.keyId)
            manager.merge(Schema.TbFinanceBrand, brand, { ...body, modifyBy: principal.uid })
            return manager.save(brand)
        })
    }

    /**编辑品牌状态*/
    public async httpBaseFinanceBrandStatusUpdate(
        principal: AuthPrincipal,
        body: BrandDto.UpdateBrandStatusDto
    ): Promise<Schema.TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            const brand = await this.brandUtilsService.findRequired(body.keyId, manager)
            brand.status = body.status
            brand.modifyBy = principal.uid
            return manager.save(brand)
        })
    }

    /**删除未被客户引用的品牌*/
    public async httpBaseFinanceDeleteBrand(body: BrandDto.BrandKeyDto): Promise<SuccessResponseDataDto> {
        await this.brandUtilsService.findRequired(body.keyId)
        await this.brandUtilsService.findUnusedRequired(
            body.keyId,
            this.crmFeignClient,
            feign.resolveFeignServiceAuthorization(this.configService)
        )
        await this.brandRepository.delete({ keyId: body.keyId })
        return { success: true }
    }

    /**品牌分页数据*/
    public async httpBaseFinanceColumnBrand(body: BrandDto.ListBrandDto): Promise<PageResult<BrandDto.BrandListItemResponseDto>> {
        return this.database.builder(this.brandRepository, async qb => {
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
                return {
                    page: body.page,
                    size: body.size,
                    total,
                    list: await feign.appendAccountUserOptions(this.accountFeignClient, this.configService, items, ['createBy', 'modifyBy'])
                }
            })
        })
    }

    /**品牌下拉数据*/
    public async httpBaseFinanceSelectBrand(): Promise<BrandDto.BrandSelectResponseDto[]> {
        return await this.database.builder(this.brandRepository, qb => {
            qb.select(['t.keyId', 't.name', 't.status', 't.document'])
            qb.where('t.status = :status', { status: Schema.TbFinanceBrandStatus.ENABLE })
            qb.orderBy('t.createTime', 'DESC')
            return qb.getMany()
        })
    }
}
