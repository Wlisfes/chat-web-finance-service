import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import { IntersectionType, OmitType, PartialType, PickType } from '@nestjs/swagger'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as SmsConstants from '@/modules/frozen/sms/sms.constants'

import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
/** 接口层使用的美元价格；数据库按放大百万倍的整数存储，换算由后端完成。 */
export class FrozenSmsPriceDto {
    @ApiProperty({ description: '上行短信价格（USD，最多6位小数）', example: 0.0076 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 6 }, { message: '上行短信价格最多保留6位小数' })
    @Min(0, { message: '上行短信价格不能小于0' })
    upUsd: number

    @ApiProperty({ description: '下行短信价格（USD，最多6位小数）', example: 0.08751 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 6 }, { message: '下行短信价格最多保留6位小数' })
    @Min(0, { message: '下行短信价格不能小于0' })
    downUsd: number
}

/** 短信基础价格响应：价格字段为美元金额。 */
export class FrozenSmsResponseDto extends IntersectionType(
    OmitType(Schema.TbFinanceFrozenSmsDto, ['upUsd', 'downUsd'] as const),
    FrozenSmsPriceDto
) {}

/** 新增短信基础价格入参：POST /frozen/sms/create。 */
export class CreateFrozenSmsDto extends IntersectionType(
    PickType(Schema.TbFinanceFrozenSmsDto, ['countryKeyId', 'remark'] as const),
    FrozenSmsPriceDto
) {}
/** 更新短信基础价格入参：POST /frozen/sms/update。 */
export class UpdateFrozenSmsDto extends IntersectionType(
    PickType(Schema.TbFinanceFrozenSmsDto, ['countryKeyId'] as const),
    FrozenSmsPriceDto,
    PartialType(PickType(Schema.TbFinanceFrozenSmsDto, ['remark'] as const))
) {
    @ApiProperty({ description: '短信基础价格主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '短信基础价格主键必须是整数' })
    @Min(1, { message: '短信基础价格主键必须大于0' })
    keyId: number
}
/** 获取短信基础价格详情入参：GET /frozen/sms/resolve。 */
export class FrozenSmsKeyDto {
    @ApiProperty({ description: '短信基础价格主键', example: 1000 })
    @Type(() => Number)
    @IsInt({ message: '短信基础价格主键必须是整数' })
    @Min(1, { message: '短信基础价格主键必须大于0' })
    keyId: number
}
/** 分页查询短信基础价格入参：POST /frozen/sms/column。 */
export class ListFrozenSmsDto extends IntersectionType(PageDto, PartialType(PickType(Schema.TbFinanceFrozenSmsDto, ['mcc'] as const))) {
    @ApiPropertyOptional({ description: '国家/地区主键', example: 1000 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '国家/地区主键必须是整数' })
    @Min(1, { message: '国家/地区主键必须大于0' })
    countryKeyId?: number
}

/** 批量上调、下调短信基础价格入参：POST /frozen/sms/fluctuate。 */
export class FluctuateFrozenSmsDto {
    @ApiProperty({ description: '需要调价的国家/地区主键集合', type: [Number], example: [1000, 1001] })
    @IsArray({ message: '国家/地区主键集合必须是数组' })
    @ArrayNotEmpty({ message: '请选择需要调价的国家/地区' })
    @ArrayMaxSize(1000, { message: '单次最多调整1000个国家/地区' })
    @ArrayUnique({ message: '国家/地区不能重复' })
    @Type(() => Number)
    @IsInt({ each: true, message: '国家/地区主键必须是整数' })
    @Min(1, { each: true, message: '国家/地区主键必须大于0' })
    countryKeyIds: number[]

    @ApiProperty({
        description: SmsConstants.FrozenSmsFluctuateModeDefinition.comment,
        enum: SmsConstants.FrozenSmsFluctuateMode,
        enumName: 'FrozenSmsFluctuateMode',
        example: SmsConstants.FrozenSmsFluctuateMode.DECREASE_NUMBER
    })
    @IsEnum(SmsConstants.FrozenSmsFluctuateMode, { message: '调价方式格式错误' })
    mode: SmsConstants.FrozenSmsFluctuateMode

    @ApiProperty({
        description: '上行调整值：按金额时为美元金额（最多6位小数，如 0.001），按百分比时为百分数（最多2位小数，10 表示 10%）',
        example: 0.001
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 6 }, { message: '上行调整值格式错误' })
    @Min(0, { message: '上行调整值不能小于0' })
    @Max(1000000, { message: '上行调整值过大' })
    upValue: number

    @ApiProperty({
        description: '下行调整值：按金额时为美元金额（最多6位小数，如 0.001），按百分比时为百分数（最多2位小数，10 表示 10%）',
        example: 0.001
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 6 }, { message: '下行调整值格式错误' })
    @Min(0, { message: '下行调整值不能小于0' })
    @Max(1000000, { message: '下行调整值过大' })
    downValue: number
}

/** 获取短信基础价格静态枚举响应：GET /frozen/sms/enums。 */
export class FrozenSmsEnumsResponseDto extends EnumsResponseDto({
    modeOptions: { description: '调价方式选项', example: SmsConstants.FrozenSmsFluctuateModeDefinition.options }
}) {}

/** 批量上调、下调短信基础价格响应：POST /frozen/sms/fluctuate。 */
export class FluctuateFrozenSmsResponseDto {
    @ApiProperty({ description: '实际调整的记录数', example: 2 })
    count: number
}

/** FrozenSmsListItemResponseDto.countryOptions 字段结构；分页查询短信基础价格响应：POST /frozen/sms/column。 */
export class FrozenSmsCountryOptionsResponseDto extends PickType(Schema.TbFinanceCountryDto, [
    'keyId',
    'code',
    'mcc',
    'cnName',
    'enName'
] as const) {}

/** FrozenSmsPageResponseDto.list 字段结构；分页查询短信基础价格响应：POST /frozen/sms/column。 */
export class FrozenSmsListItemResponseDto extends FrozenSmsResponseDto {
    @ApiProperty({ description: '国家地区信息', type: FrozenSmsCountryOptionsResponseDto, required: false })
    countryOptions?: FrozenSmsCountryOptionsResponseDto

    @ApiProperty({ description: '创建人选项', type: feign.AccountUserOptionResponseDto, required: false })
    createByOptions?: feign.AccountUserOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: feign.AccountUserOptionResponseDto, required: false })
    modifyByOptions?: feign.AccountUserOptionResponseDto
}

/** 分页查询短信基础价格响应：POST /frozen/sms/column。 */
export class FrozenSmsPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '短信基础价格列表', type: [FrozenSmsListItemResponseDto] })
    list: FrozenSmsListItemResponseDto[]
}
