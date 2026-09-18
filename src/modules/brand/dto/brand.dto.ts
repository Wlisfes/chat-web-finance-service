import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema'

import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
export class CreateBrandDto extends PickType(Schema.TbFinanceBrandDto, ['name', 'document', 'status'] as const) {}
export class UpdateBrandDto extends IntersectionType(
    PickType(Schema.TbFinanceBrandDto, ['name', 'document'] as const),
    PartialType(PickType(Schema.TbFinanceBrandDto, ['status'] as const))
) {
    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    keyId: number
}
export class UpdateBrandStatusDto extends PickType(Schema.TbFinanceBrandDto, ['status'] as const) {
    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    keyId: number
}
export class ListBrandDto extends IntersectionType(PageDto, PartialType(PickType(Schema.TbFinanceBrandDto, ['name', 'status'] as const))) {}
