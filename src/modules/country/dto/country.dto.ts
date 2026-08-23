import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { TbFinanceCountryDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class ListCountryDto extends IntersectionType(
    SizePageDto,
    PartialType(PickType(TbFinanceCountryDto, ['cnName', 'status', 'mcc'] as const))
) {}
export class UpdateCountryStatusDto extends PickType(TbFinanceCountryDto, ['status'] as const) {
    @ApiProperty({ description: '国家地区主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '国家地区主键必须是整数' })
    @Min(1, { message: '国家地区主键必须大于0' })
    keyId: number
}
