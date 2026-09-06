import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
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
