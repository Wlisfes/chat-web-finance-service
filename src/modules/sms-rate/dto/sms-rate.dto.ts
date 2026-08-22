import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
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
