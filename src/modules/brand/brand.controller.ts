import { Body, Post } from '@nestjs/common'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { TbFinanceBrandDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { BrandService } from '@/modules/brand/brand.service'
import { CreateBrandDto, ListBrandDto, UpdateBrandDto, UpdateBrandStatusDto } from '@/modules/brand/dto/brand.dto'
import { BrandPageResponseDto, BrandSelectResponseDto } from '@/dto/api-response.dto'

@ApifoxController('财务中心-品牌', 'brand', { bearerAuth: true })
export class BrandController {
    constructor(private readonly brandService: BrandService) {}

    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增品牌' },
        request: { source: 'body', type: CreateBrandDto },
        response: { type: TbFinanceBrandDto, description: '新增后的品牌信息' }
    })
    httpBaseFinanceCreateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateBrandDto) {
        return this.brandService.create(principal.uid, input)
    }

    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新品牌' },
        request: { source: 'body', type: UpdateBrandDto },
        response: { type: TbFinanceBrandDto, description: '更新后的品牌信息' }
    })
    httpBaseFinanceUpdateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandDto) {
        return this.brandService.update(principal.uid, input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新品牌状态' },
        request: { source: 'body', type: UpdateBrandStatusDto },
        response: { type: TbFinanceBrandDto, description: '更新后的品牌信息' }
    })
    httpBaseFinanceUpdateBrandStatus(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandStatusDto) {
        return this.brandService.updateStatus(principal.uid, input)
    }

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询品牌' },
        request: { source: 'body', type: ListBrandDto },
        response: { type: BrandPageResponseDto, description: '品牌分页数据' }
    })
    httpBaseFinanceColumnBrand(@Body() input: ListBrandDto) {
        return this.brandService.list(input)
    }

    @ApiServiceDecorator(Post('select'), {
        operation: { summary: '获取可用品牌下拉选项' },
        response: { type: BrandSelectResponseDto, description: '可用品牌列表' }
    })
    httpBaseFinanceSelectBrand() {
        return this.brandService.select()
    }
}
