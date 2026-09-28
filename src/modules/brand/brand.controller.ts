import { Body, Get, Post, Query } from '@nestjs/common'
import { CurrentPrincipal, RequirePermissions, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { BrandService } from '@/modules/brand/brand.service'
import { BrandPageResponseDto, BrandSelectResponseDto } from '@/dto/api-response.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as BrandDto from '@/modules/brand/dto/brand.dto'

@ApifoxController('财务中心-品牌', 'brand', { bearerAuth: true })
export class BrandController {
    constructor(private readonly brandService: BrandService) {}

    @RequirePermissions('chat:finance:base:brand')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取品牌状态枚举' },
        response: { type: BrandDto.BrandEnumsResponseDto, description: '品牌静态枚举' }
    })
    public async httpBaseFinanceBrandEnums() {
        return this.brandService.httpBaseFinanceBrandEnums()
    }

    @RequirePermissions('chat:finance:base:brand')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询品牌' },
        request: { source: 'body', type: BrandDto.ListBrandDto },
        response: { type: BrandPageResponseDto, description: '品牌分页数据' }
    })
    public async httpBaseFinanceColumnBrand(@Body() input: BrandDto.ListBrandDto) {
        return this.brandService.httpBaseFinanceColumnBrand(input)
    }

    @RequirePermissions('chat:finance:base:brand')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取品牌详情' },
        request: { source: 'query', type: BrandDto.BrandKeyDto },
        response: { type: Schema.TbFinanceBrandDto, description: '品牌详情' }
    })
    public async httpBaseFinanceBrandResolver(@Query() query: BrandDto.BrandKeyDto) {
        return this.brandService.httpBaseFinanceBrandResolver(query)
    }

    @RequirePermissions('chat:finance:base:brand:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增品牌' },
        request: { source: 'body', type: BrandDto.CreateBrandDto },
        response: { type: Schema.TbFinanceBrandDto, description: '新增后的品牌信息' }
    })
    public async httpBaseFinanceCreateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: BrandDto.CreateBrandDto) {
        return this.brandService.httpBaseFinanceCreateBrand(principal, input)
    }

    @RequirePermissions('chat:finance:base:brand:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新品牌' },
        request: { source: 'body', type: BrandDto.UpdateBrandDto },
        response: { type: Schema.TbFinanceBrandDto, description: '更新后的品牌信息' }
    })
    public async httpBaseFinanceUpdateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: BrandDto.UpdateBrandDto) {
        return this.brandService.httpBaseFinanceUpdateBrand(principal, input)
    }

    @RequirePermissions('chat:finance:base:brand:update')
    @ApiServiceDecorator(Post('status/update'), {
        operation: { summary: '更新品牌状态' },
        request: { source: 'body', type: BrandDto.UpdateBrandStatusDto },
        response: { type: Schema.TbFinanceBrandDto, description: '更新后的品牌信息' }
    })
    public async httpBaseFinanceUpdateBrandStatus(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: BrandDto.UpdateBrandStatusDto
    ) {
        return this.brandService.httpBaseFinanceUpdateBrandStatus(principal, input)
    }

    @RequirePermissions('chat:finance:base:brand:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除品牌' },
        request: { source: 'body', type: BrandDto.BrandKeyDto },
        response: { type: SuccessResponseDataDto, description: '品牌删除结果' }
    })
    public async httpBaseFinanceDeleteBrand(@Body() input: BrandDto.BrandKeyDto) {
        return this.brandService.httpBaseFinanceDeleteBrand(input)
    }

    @RequirePermissions('*')
    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用品牌下拉选项' },
        response: { type: BrandSelectResponseDto, description: '可用品牌列表' }
    })
    public async httpBaseFinanceSelectBrand() {
        return this.brandService.httpBaseFinanceSelectBrand()
    }
}
