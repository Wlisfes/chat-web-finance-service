import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema'

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
