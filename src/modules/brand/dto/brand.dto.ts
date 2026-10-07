import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as feign from '@wlisfes/chat-web-base-schema/feign'

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
export class BrandKeyDto {
    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    keyId: number
}
export class ListBrandDto extends IntersectionType(PageDto, PartialType(PickType(Schema.TbFinanceBrandDto, ['name', 'status'] as const))) {}

export class BrandEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '品牌状态选项', example: Schema.TbFinanceBrandStatusDefinition.options }
}) {}

export class BrandListItemResponseDto extends Schema.TbFinanceBrandDto {
    @ApiProperty({ description: '创建人选项', type: feign.AccountUserOptionResponseDto, required: false })
    createByOptions?: feign.AccountUserOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: feign.AccountUserOptionResponseDto, required: false })
    modifyByOptions?: feign.AccountUserOptionResponseDto
}

export class BrandPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '品牌列表', type: [BrandListItemResponseDto] })
    list: BrandListItemResponseDto[]
}

export class BrandSelectResponseDto extends PickType(Schema.TbFinanceBrandDto, ['keyId', 'name', 'status', 'document'] as const) {}
