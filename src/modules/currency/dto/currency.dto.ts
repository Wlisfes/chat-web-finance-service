import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator'
import { TbFinanceCurrencyDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'

export class ListCurrencyDto extends IntersectionType(PageDto, PartialType(PickType(TbFinanceCurrencyDto, ['name', 'status'] as const))) {}
export class UpdateCurrencyStatusDto extends PickType(TbFinanceCurrencyDto, ['status'] as const) {
    @ApiProperty({ description: '币种主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '币种主键必须是整数' })
    @Min(1, { message: '币种主键必须大于0' })
    keyId: number
}

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

export class ResolveCurrencyExchangeDto {
    @ApiProperty({ description: '币种编码', example: 'CNY' })
    @IsString({ message: '币种编码必须是字符串' })
    @IsNotEmpty({ message: '币种编码必填' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency: string
}

/**单项汇率同步数据。*/
export class SyncCurrencyExchangeRateDto {
    @ApiProperty({ description: '币种编码，使用 ISO 4217 三位编码', example: 'CNY' })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsString({ message: '币种编码必须是字符串' })
    @IsNotEmpty({ message: '币种编码必填' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency: string

    @ApiProperty({ description: '基于 USD 的汇率', example: 7.2534 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 6 }, { message: '汇率格式错误' })
    @Min(0, { message: '汇率不能小于0' })
    rate: number
}

/**批量同步某日币种汇率。*/
export class SyncCurrencyExchangeDto {
    @ApiProperty({ description: '汇率日期', format: 'date', example: '2026-09-02' })
    @IsDateString({}, { message: '汇率日期格式错误' })
    date: string

    @ApiProperty({ description: '币种汇率集合', type: [SyncCurrencyExchangeRateDto] })
    @IsArray({ message: '汇率集合必须是数组' })
    @ArrayNotEmpty({ message: '汇率集合不能为空' })
    @ArrayMaxSize(200, { message: '单次最多同步200种币种' })
    @ValidateNested({ each: true })
    @Type(() => SyncCurrencyExchangeRateDto)
    rates: SyncCurrencyExchangeRateDto[]
}
