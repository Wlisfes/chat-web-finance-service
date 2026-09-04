import { ApiProperty, PickType } from '@nestjs/swagger'
import { PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import {
    TbFinanceBasicSmsRateDto,
    TbFinanceBrandDto,
    TbFinanceCountryDto,
    TbFinanceCurrencyDto,
    TbFinanceCurrencyExchangeDto
} from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'

export class ServiceLivenessResponseDto {
    @ApiProperty({ description: '服务状态', enum: ['UP'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string
}

export class ServiceDependencyResponseDto {
    @ApiProperty({ description: '依赖是否连接成功', example: true })
    connected: boolean

    @ApiProperty({ description: '必需数据表数量', required: false, example: 5 })
    requiredTableCount?: number

    @ApiProperty({ description: '缺失的数据表', type: [String], required: false, example: [] })
    missingTables?: string[]

    @ApiProperty({ description: '检查失败原因', required: false, example: '连接超时' })
    error?: string
}

export class ServiceAuthModeResponseDto {
    @ApiProperty({ description: '鉴权模式', example: 'account-service-introspection' })
    mode: string
}

export class ServiceReadinessResponseDto {
    @ApiProperty({ description: '服务就绪状态', enum: ['UP', 'DOWN'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string

    @ApiProperty({ description: '数据库状态', type: ServiceDependencyResponseDto })
    database: ServiceDependencyResponseDto

    @ApiProperty({ description: 'Redis 状态', type: ServiceDependencyResponseDto })
    redis: ServiceDependencyResponseDto

    @ApiProperty({ description: '鉴权模式', type: ServiceAuthModeResponseDto })
    auth: ServiceAuthModeResponseDto
}

export class OperatorOptionResponseDto {
    @ApiProperty({ description: '账号 UID', example: '2149446185344106496' })
    uid: string

    @ApiProperty({ description: '工号', required: false, example: '1234' })
    number?: string

    @ApiProperty({ description: '姓名', required: false, example: '张三' })
    name?: string

    @ApiProperty({ description: '头像地址', required: false, example: 'https://picsum.photos/500' })
    avatar?: string
}

export class BrandListItemResponseDto extends TbFinanceBrandDto {
    @ApiProperty({ description: '创建人选项', type: OperatorOptionResponseDto, required: false })
    createByOptions?: OperatorOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: OperatorOptionResponseDto, required: false })
    modifyByOptions?: OperatorOptionResponseDto
}

export class BrandPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '品牌列表', type: [BrandListItemResponseDto] })
    list: BrandListItemResponseDto[]
}

export class BrandSelectResponseDto {
    @ApiProperty({ description: '可用品牌列表', type: [TbFinanceBrandDto] })
    list: TbFinanceBrandDto[]
}

export class CountryPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '国家地区列表', type: [TbFinanceCountryDto] })
    list: TbFinanceCountryDto[]
}

export class CountrySelectItemResponseDto extends TbFinanceCountryDto {
    @ApiProperty({ description: '中英文组合展示名称', example: '中国 -China' })
    showName: string
}

export class CountrySelectResponseDto {
    @ApiProperty({ description: '可用国家地区列表', type: [CountrySelectItemResponseDto] })
    list: CountrySelectItemResponseDto[]
}

export class CurrencyPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '币种列表', type: [TbFinanceCurrencyDto] })
    list: TbFinanceCurrencyDto[]
}

export class CurrencySelectResponseDto {
    @ApiProperty({ description: '可用币种列表', type: [TbFinanceCurrencyDto] })
    list: TbFinanceCurrencyDto[]
}

export class CurrencyExchangeListItemResponseDto extends TbFinanceCurrencyExchangeDto {
    @ApiProperty({ description: '兼容前端使用的汇率日期', example: '2026-08-23' })
    date: string
}

export class CurrencyExchangeResponseDto extends PickType(TbFinanceCurrencyExchangeDto, ['currency', 'rate', 'rateDate'] as const) {
    @ApiProperty({ description: '兼容前端使用的汇率日期', example: '2026-08-23' })
    date: string
}

export class CurrencyExchangePageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '汇率列表', type: [CurrencyExchangeListItemResponseDto] })
    list: CurrencyExchangeListItemResponseDto[]
}

export class CurrencyExchangeSyncListItemResponseDto {
    @ApiProperty({ description: '币种编码', example: 'CNY' })
    currency: string

    @ApiProperty({ description: '基于 USD 的汇率', example: 7.2534 })
    rate: number

    @ApiProperty({ description: '汇率日期', format: 'date', example: '2026-09-02' })
    date: string
}

export class CurrencyExchangeSyncResponseDto {
    @ApiProperty({ description: '汇率日期', format: 'date', example: '2026-09-02' })
    date: string

    @ApiProperty({ description: '已同步汇率数量', example: 28 })
    count: number

    @ApiProperty({ description: '已同步汇率列表', type: [CurrencyExchangeSyncListItemResponseDto] })
    list: CurrencyExchangeSyncListItemResponseDto[]
}

export class SmsRateListItemResponseDto extends TbFinanceBasicSmsRateDto {
    @ApiProperty({ description: '国家地区信息', type: TbFinanceCountryDto, required: false })
    countryOptions?: TbFinanceCountryDto

    @ApiProperty({ description: '创建人选项', type: OperatorOptionResponseDto, required: false })
    createByOptions?: OperatorOptionResponseDto

    @ApiProperty({ description: '修改人选项', type: OperatorOptionResponseDto, required: false })
    modifyByOptions?: OperatorOptionResponseDto
}

export class SmsRatePageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '短信基础价格列表', type: [SmsRateListItemResponseDto] })
    list: SmsRateListItemResponseDto[]
}

export class BatchSmsRateResponseDto extends TbFinanceBasicSmsRateDto {
    @ApiProperty({ description: '国家地区主键', example: 1 })
    countryKeyId: number

    @ApiProperty({ description: '国家地区中文名称', example: '中国' })
    cnName: string

    @ApiProperty({ description: '国家地区英文名称', example: 'China' })
    enName: string
}
