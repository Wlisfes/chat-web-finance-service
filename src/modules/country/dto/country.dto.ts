import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbFinanceCountryDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { PageDto } from '@/common/dto/page.dto'

export class ListCountryDto extends IntersectionType(
    PageDto,
    PartialType(PickType(TbFinanceCountryDto, ['cnName', 'status', 'mcc'] as const))
) {}
export class UpdateCountryStatusDto extends PickType(TbFinanceCountryDto, ['keyId', 'status'] as const) {}
