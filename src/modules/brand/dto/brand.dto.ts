import { IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbFinanceBrandDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class CreateBrandDto extends PickType(TbFinanceBrandDto, ['name', 'document', 'status'] as const) {}
export class UpdateBrandDto extends IntersectionType(
    PickType(TbFinanceBrandDto, ['keyId', 'name', 'document'] as const),
    PartialType(PickType(TbFinanceBrandDto, ['status'] as const))
) {}
export class UpdateBrandStatusDto extends PickType(TbFinanceBrandDto, ['keyId', 'status'] as const) {}
export class ListBrandDto extends IntersectionType(SizePageDto, PartialType(PickType(TbFinanceBrandDto, ['name', 'status'] as const))) {}
