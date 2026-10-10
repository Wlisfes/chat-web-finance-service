import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as feign from '@wlisfes/chat-web-base-schema/feign'

import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
/** 分页查询币种入参：POST /currency/column。 */
export class ListCurrencyDto extends IntersectionType(
    PageDto,
    PartialType(PickType(Schema.TbFinanceCurrencyDto, ['name', 'status'] as const))
) {}
/** 更新币种状态入参：POST /currency/status/update。 */
export class UpdateCurrencyStatusDto extends PickType(Schema.TbFinanceCurrencyDto, ['status'] as const) {
    @ApiProperty({ description: '币种主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '币种主键必须是整数' })
    @Min(1, { message: '币种主键必须大于0' })
    keyId: number
}

/** 分页查询币种汇率入参：POST /currency/exchange/column。 */
export class ListCurrencyExchangeDto extends PageDto {
    @ApiPropertyOptional({ description: '币种编码', example: 'CNY' })
    @IsOptional()
    @IsString({ message: '币种编码必须是字符串' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency?: string

    @ApiPropertyOptional({ description: '汇率日期', format: 'date', example: '2026-08-23' })
    @IsOptional()
    @IsDateString({}, { message: '汇率日期格式错误' })
    date?: string
}

/** 获取币种最新汇率入参：GET /currency/exchange/resolve。 */
export class ResolveCurrencyExchangeDto {
    @ApiProperty({ description: '币种编码', example: 'CNY' })
    @IsString({ message: '币种编码必须是字符串' })
    @IsNotEmpty({ message: '币种编码必填' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency: string
}

/** 获取币种状态枚举响应：GET /currency/enums。 */
export class CurrencyEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '币种状态选项', example: Schema.TbFinanceCurrencyStatusDefinition.options }
}) {}

/** CurrencyPageResponseDto.list 字段结构；分页查询币种响应：POST /currency/column。 */
export class CurrencyListItemResponseDto extends Schema.TbFinanceCurrencyDto {
    @ApiProperty({ description: '创建人选项', type: feign.AccountUserOptionResponseDto, required: false })
    createByOptions?: feign.AccountUserOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: feign.AccountUserOptionResponseDto, required: false })
    modifyByOptions?: feign.AccountUserOptionResponseDto
}

/** 分页查询币种响应：POST /currency/column。 */
export class CurrencyPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '币种列表', type: [CurrencyListItemResponseDto] })
    list: CurrencyListItemResponseDto[]
}

/** 获取可用币种下拉选项响应：POST /currency/select。 */
export class CurrencySelectResponseDto extends PickType(Schema.TbFinanceCurrencyDto, [
    'keyId',
    'currency',
    'name',
    'symbol',
    'status'
] as const) {}

/** CurrencyExchangePageResponseDto.list 字段结构；分页查询币种汇率响应：POST /currency/exchange/column。 */
export class CurrencyExchangeListItemResponseDto extends Schema.TbFinanceCurrencyExchangeDto {
    @ApiProperty({ description: '创建人选项', type: feign.AccountUserOptionResponseDto, required: false })
    createByOptions?: feign.AccountUserOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: feign.AccountUserOptionResponseDto, required: false })
    modifyByOptions?: feign.AccountUserOptionResponseDto
}

/** 获取币种最新汇率响应：GET /currency/exchange/resolve。 */
export class CurrencyExchangeResponseDto extends PickType(Schema.TbFinanceCurrencyExchangeDto, ['currency', 'rate', 'date'] as const) {}

/** 分页查询币种汇率响应：POST /currency/exchange/column。 */
export class CurrencyExchangePageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '汇率列表', type: [CurrencyExchangeListItemResponseDto] })
    list: CurrencyExchangeListItemResponseDto[]
}

/** CurrencyExchangeSyncResponseDto.list 字段结构；拉取并同步最新币种汇率响应：POST /currency/exchange/sync。 */
export class CurrencyExchangeSyncListItemResponseDto {
    @ApiProperty({ description: '币种编码', example: 'CNY' })
    currency: string

    @ApiProperty({ description: '基于 USD 的汇率', example: 7.2534 })
    rate: number

    @ApiProperty({ description: '汇率日期', format: 'date', example: '2026-09-02' })
    date: string
}

/** 拉取并同步最新币种汇率响应：POST /currency/exchange/sync。 */
export class CurrencyExchangeSyncResponseDto {
    @ApiProperty({ description: '汇率日期', format: 'date', example: '2026-09-02' })
    date: string

    @ApiProperty({ description: '已同步汇率数量', example: 28 })
    count: number

    @ApiProperty({ description: '已同步汇率列表', type: [CurrencyExchangeSyncListItemResponseDto] })
    list: CurrencyExchangeSyncListItemResponseDto[]
}
