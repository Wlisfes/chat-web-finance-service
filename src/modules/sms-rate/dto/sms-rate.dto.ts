import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, Min } from 'class-validator'
import { TbFinanceBasicSmsRateDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class CreateSmsRateDto extends PickType(TbFinanceBasicSmsRateDto, ['code', 'mcc', 'upUsd', 'downUsd', 'remark'] as const) {}
export class UpdateSmsRateDto extends IntersectionType(
    PickType(TbFinanceBasicSmsRateDto, ['keyId', 'code', 'mcc', 'upUsd', 'downUsd'] as const),
    PartialType(PickType(TbFinanceBasicSmsRateDto, ['remark'] as const))
) {}
export class ListSmsRateDto extends IntersectionType(
    SizePageDto,
    PartialType(PickType(TbFinanceBasicSmsRateDto, ['code', 'mcc'] as const))
) {}

export class BatchSmsRateDto {
    @ApiProperty({ description: '国家/地区主键集合', type: [Number], example: [1, 2, 3] })
    @IsArray({ message: '国家/地区主键集合必须是数组' })
    @ArrayNotEmpty({ message: '国家/地区主键集合不能为空' })
    @ArrayMaxSize(200, { message: '单次最多查询200个国家/地区' })
    @Type(() => Number)
    @IsInt({ each: true, message: '国家/地区主键必须是整数' })
    @Min(1, { each: true, message: '国家/地区主键必须大于0' })
    countryKeyIds: number[]
}
