import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator'
import { TbFinanceCurrencyDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class ListCurrencyDto extends IntersectionType(
    SizePageDto,
    PartialType(PickType(TbFinanceCurrencyDto, ['name', 'status'] as const))
) {}
export class UpdateCurrencyStatusDto extends PickType(TbFinanceCurrencyDto, ['keyId', 'status'] as const) {}

export class ListCurrencyExchangeDto extends SizePageDto {
    @IsOptional()
    @IsString({ message: '币种编码必须是字符串' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency?: string

    @IsOptional()
    @IsDateString({}, { message: '汇率日期格式错误' })
    date?: string
}
