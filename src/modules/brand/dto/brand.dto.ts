import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { TbFinanceBrandDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class CreateBrandDto extends PickType(TbFinanceBrandDto, ['name', 'document', 'status'] as const) {}
export class UpdateBrandDto extends IntersectionType(
    PickType(TbFinanceBrandDto, ['name', 'document'] as const),
    PartialType(PickType(TbFinanceBrandDto, ['status'] as const))
) {
    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    keyId: number
}
export class UpdateBrandStatusDto extends PickType(TbFinanceBrandDto, ['status'] as const) {
    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    keyId: number
}
export class ListBrandDto extends IntersectionType(SizePageDto, PartialType(PickType(TbFinanceBrandDto, ['name', 'status'] as const))) {}
