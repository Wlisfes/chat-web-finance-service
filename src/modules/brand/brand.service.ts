import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { TbFinanceBrand, TbFinanceBrandStatus } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { BrandListItemResponseDto, BrandSelectResponseDto } from '@/dto/api-response.dto'
import { BrandUtilsService } from '@/modules/brand/brand.utils.service'
import * as BrandDto from '@/modules/brand/dto/brand.dto'

@Injectable()
export class BrandService {
    constructor(
        @InjectRepository(TbFinanceBrand) private readonly brandRepository: Repository<TbFinanceBrand>,
        private readonly database: DataBaseService,
        private readonly brandUtilsService: BrandUtilsService
    ) {}

    /**新增品牌*/
    public async httpBaseFinanceCreateBrand(principal: AuthPrincipal, body: BrandDto.CreateBrandDto): Promise<TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            await this.brandUtilsService.findNameAvailable(body.name, manager)
            const brand = manager.create(TbFinanceBrand, { ...body, createBy: principal.uid, modifyBy: principal.uid })
            return manager.save(brand)
        })
    }

    /**编辑品牌*/
    public async httpBaseFinanceUpdateBrand(principal: AuthPrincipal, body: BrandDto.UpdateBrandDto): Promise<TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            const brand = await this.brandUtilsService.findRequired(body.keyId, manager)
            await this.brandUtilsService.findNameAvailable(body.name, manager, body.keyId)
            manager.merge(TbFinanceBrand, brand, { ...body, modifyBy: principal.uid })
            return manager.save(brand)
        })
    }

    /**编辑品牌状态*/
    public async httpBaseFinanceUpdateBrandStatus(principal: AuthPrincipal, body: BrandDto.UpdateBrandStatusDto): Promise<TbFinanceBrand> {
        return this.brandRepository.manager.transaction(async manager => {
            const brand = await this.brandUtilsService.findRequired(body.keyId, manager)
            brand.status = body.status
            brand.modifyBy = principal.uid
            return manager.save(brand)
        })
    }

    /**品牌分页数据*/
    public async httpBaseFinanceColumnBrand(body: BrandDto.ListBrandDto): Promise<PageResult<BrandListItemResponseDto>> {
        return this.database.builder(this.brandRepository, async qb => {
            if (isNotEmpty(body.name?.trim())) {
                qb.andWhere('t.name LIKE :name', { name: `%${body.name?.trim()}%` })
            }
            if (isNotEmpty(body.status)) {
                qb.andWhere('t.status = :status', { status: body.status })
            }
            qb.orderBy('t.createTime', 'DESC')
                .skip((body.page - 1) * body.size)
                .take(body.size)
            const [items, total] = await qb.getManyAndCount()
            return {
                page: body.page,
                size: body.size,
                total,
                list: items.map(item => ({
                    ...item,
                    createByOptions: isNotEmpty(item.createBy) ? { uid: item.createBy } : undefined,
                    modifyByOptions: isNotEmpty(item.modifyBy) ? { uid: item.modifyBy } : undefined
                }))
            }
        })
    }

    /**品牌下拉数据*/
    public async httpBaseFinanceSelectBrand(): Promise<BrandSelectResponseDto> {
        const list = await this.database.builder(this.brandRepository, qb => {
            return qb.where('t.status = :status', { status: TbFinanceBrandStatus.ENABLE }).orderBy('t.createTime', 'DESC').getMany()
        })
        return { list }
    }
}
