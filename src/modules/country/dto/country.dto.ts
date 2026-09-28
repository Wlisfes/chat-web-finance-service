import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as feign from '@wlisfes/chat-web-base-schema/feign'

import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
export class ListCountryDto extends IntersectionType(
    PageDto,
    PartialType(PickType(Schema.TbFinanceCountryDto, ['cnName', 'status', 'mcc'] as const))
) {}
export class UpdateCountryStatusDto extends PickType(Schema.TbFinanceCountryDto, ['status'] as const) {
    @ApiProperty({ description: '国家地区主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '国家地区主键必须是整数' })
    @Min(1, { message: '国家地区主键必须大于0' })
    keyId: number
}

export class CountryEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '国家/地区状态选项', example: Schema.TbFinanceCountryStatusDefinition.options }
}) {}

export class CountryListItemResponseDto extends Schema.TbFinanceCountryDto {
    @ApiProperty({ description: '创建人选项', type: feign.AccountUserOptionResponseDto, required: false })
    createByOptions?: feign.AccountUserOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: feign.AccountUserOptionResponseDto, required: false })
    modifyByOptions?: feign.AccountUserOptionResponseDto
}

export class CountryPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '国家地区列表', type: [CountryListItemResponseDto] })
    list: CountryListItemResponseDto[]
}

export class CountrySelectResponseDto extends PickType(Schema.TbFinanceCountryDto, ['keyId', 'code', 'mcc', 'cnName', 'enName'] as const) {
    @ApiProperty({ description: '编码及中英文组合展示名称', example: '86 中国 - China' })
    showName: string
}
