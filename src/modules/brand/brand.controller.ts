import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@/modules/auth/auth.decorator'
import type { AuthPrincipal } from '@/modules/auth/auth.interface'
import { BrandService } from '@/modules/brand/brand.service'
import { CreateBrandDto, ListBrandDto, UpdateBrandDto, UpdateBrandStatusDto } from '@/modules/brand/dto/brand.dto'

@ApiTags('财务中心-品牌')
@ApiBearerAuth('authorization')
@Controller('brand')
export class BrandController {
    constructor(private readonly service: BrandService) {}

    @Post('create')
    @ApiOperation({ summary: '新增品牌' })
    create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateBrandDto) {
        return this.service.create(principal.uid, input)
    }

    @Post('update')
    update(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandDto) {
        return this.service.update(principal.uid, input)
    }

    @Post('update/status')
    updateStatus(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateBrandStatusDto) {
        return this.service.updateStatus(principal.uid, input)
    }

    @Post('column')
    list(@Body() input: ListBrandDto) {
        return this.service.list(input)
    }

    @Post('select')
    select() {
        return this.service.select()
    }
}
