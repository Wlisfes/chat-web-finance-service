import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import {
    TbFinanceClientAuthStatus,
    TbFinanceClientDto,
    TbFinanceClientPayMode,
    TbFinanceClientSource,
    TbFinanceClientStatus
} from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { PageDto } from '@/common/dto/page.dto'

export class CreateClientDto {
    @ApiProperty({ description: '客户名称', example: '测试客户' })
    @IsString({ message: '客户名称必须是字符串' })
    @IsNotEmpty({ message: '客户名称必填' })
    @MaxLength(64, { message: '客户名称长度不能超过64位' })
    name: string

    @ApiProperty({ description: '客户别名', required: false })
    @IsOptional()
    @IsString({ message: '客户别名必须是字符串' })
    @MaxLength(64, { message: '客户别名长度不能超过64位' })
    alias?: string

    @ApiProperty({ description: '品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    brandId: number

    @ApiProperty({ description: '币种编码', example: 'USD' })
    @IsString({ message: '币种编码必须是字符串' })
    @MaxLength(16, { message: '币种编码长度不能超过16位' })
    currency: string

    @ApiProperty({ description: '邮箱', example: 'client@example.com' })
    @IsEmail({}, { message: '邮箱格式错误' })
    email: string

    @ApiProperty({ description: '电话号码', required: false })
    @IsOptional()
    @IsString({ message: '电话号码必须是字符串' })
    @MaxLength(32, { message: '电话号码长度不能超过32位' })
    phone?: string

    @ApiProperty({ enum: TbFinanceClientStatus, required: false })
    @IsOptional()
    @IsEnum(TbFinanceClientStatus, { message: '客户状态格式错误' })
    status?: TbFinanceClientStatus

    @ApiProperty({ enum: TbFinanceClientPayMode })
    @IsEnum(TbFinanceClientPayMode, { message: '付款模式格式错误' })
    payMode: TbFinanceClientPayMode

    @ApiProperty({ enum: TbFinanceClientAuthStatus, required: false })
    @IsOptional()
    @IsEnum(TbFinanceClientAuthStatus, { message: '认证状态格式错误' })
    authStatus?: TbFinanceClientAuthStatus

    @ApiProperty({ enum: TbFinanceClientSource, required: false })
    @IsOptional()
    @IsEnum(TbFinanceClientSource, { message: '注册来源格式错误' })
    source?: TbFinanceClientSource

    @ApiProperty({ description: '备注', required: false })
    @IsOptional()
    @IsString({ message: '备注必须是字符串' })
    @MaxLength(1024, { message: '备注长度不能超过1024位' })
    remark?: string
}

export class UpdateClientDto extends CreateClientDto {
    @ApiProperty({ description: '客户主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '客户主键必须是整数' })
    @Min(1, { message: '客户主键必须大于0' })
    keyId: number
}

export class UpdateClientStatusDto extends PickType(TbFinanceClientDto, ['keyId', 'status'] as const) {}

export class ListClientDto extends IntersectionType(
    PageDto,
    PartialType(PickType(TbFinanceClientDto, ['name', 'status', 'currency', 'payMode', 'authStatus', 'source'] as const))
) {
    @ApiProperty({ description: '品牌主键', required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '品牌主键必须是整数' })
    @Min(1, { message: '品牌主键必须大于0' })
    brandId?: number
}
