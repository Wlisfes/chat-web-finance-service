import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { FeignClientAccountManager, resolveFeignServiceAuthorization } from '@wlisfes/chat-web-base-schema/feign'
import { BrandListItemResponseDto, BrandSelectResponseDto, OperatorOptionResponseDto } from '@/dto/api-response.dto'
import { BrandUtilsService } from '@/modules/brand/brand.utils.service'
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
        private readonly accountFeignClient: FeignClientAccountManager,
        private readonly configService: ConfigService
    ) {}

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
    public async httpBaseFinanceUpdateBrandStatus(
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
            qb.skip((body.page - 1) * body.size)
            qb.take(body.size)
            return await qb.getManyAndCount().then(async ([items, total]) => {
                const operatorUids = [...new Set(items.flatMap(item => [item.createBy, item.modifyBy]).filter(uid => isNotEmpty(uid)))]
                // 操作人姓名属于展示元数据，使用服务间凭据批量还原，不转发终端用户令牌。
                const users =
                    operatorUids.length > 0
                        ? await this.accountFeignClient.batchResolveUsers(resolveFeignServiceAuthorization(this.configService), {
                              uids: operatorUids
                          })
                        : []
                const userOptionsByUid = new Map<string, OperatorOptionResponseDto>(
                    users.map(user => {
                        const option: OperatorOptionResponseDto = { uid: user.uid, number: user.number, name: user.name }
                        if (isNotEmpty(user.avatar)) option.avatar = user.avatar
                        return [user.uid, option]
                    })
                )
                return {
                    page: body.page,
                    size: body.size,
                    total,
                    list: items.map(item => ({
                        ...item,
                        createByOptions: this.toOperatorOption(item.createBy, userOptionsByUid),
                        modifyByOptions: this.toOperatorOption(item.modifyBy, userOptionsByUid)
                    }))
                }
            })
        })
    }

    private toOperatorOption(
        uid: string | undefined,
        userOptionsByUid: Map<string, OperatorOptionResponseDto>
    ): OperatorOptionResponseDto | undefined {
        if (!isNotEmpty(uid)) return undefined
        return userOptionsByUid.get(uid) ?? { uid }
    }

    /**品牌下拉数据*/
    public async httpBaseFinanceSelectBrand(): Promise<BrandSelectResponseDto> {
        const list = await this.database.builder(this.brandRepository, qb => {
            return qb.where('t.status = :status', { status: Schema.TbFinanceBrandStatus.ENABLE }).orderBy('t.createTime', 'DESC').getMany()
        })
        return { list }
    }
}
