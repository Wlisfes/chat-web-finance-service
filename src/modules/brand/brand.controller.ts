import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { BrandService } from '@/modules/brand/brand.service'
import { CreateBrandDto, ListBrandDto, UpdateBrandDto, UpdateBrandStatusDto } from '@/modules/brand/dto/brand.dto'

@ApiTags('财务中心-品牌')
@ApiBearerAuth('authorization')
@Controller('brand')
export class BrandController {
    constructor(private readonly brandService: BrandService) {}

    @Post('create')
    @ApiOperation({ summary: '新增品牌' })
    httpBaseFinanceCreateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateBrandDto) {
        return this.brandService.create(principal.uid, input)
    }

    @Post('update')
    httpBaseFinanceUpdateBrand(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandDto) {
        return this.brandService.update(principal.uid, input)
    }

    @Post('update/status')
    httpBaseFinanceUpdateBrandStatus(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandStatusDto) {
        return this.brandService.updateStatus(principal.uid, input)
    }

    @Post('column')
    httpBaseFinanceColumnBrand(@Body() input: ListBrandDto) {
        return this.brandService.list(input)
    }

    @Post('select')
    httpBaseFinanceSelectBrand() {
        return this.brandService.select()
    }
}
