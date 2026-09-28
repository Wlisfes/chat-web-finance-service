import {
    TbFinanceFrozenSms,
    TbFinanceBrand,
    TbFinanceCountry,
    TbFinanceCurrency,
    TbFinanceCurrencyExchange
} from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'

/** Nacos 中 Finance 服务 MySQL 配置的根路径。 */
export const FINANCE_MYSQL_CONFIG_KEY = 'database.chat-web-finance'

/** Finance 数据库包含的全部 TypeORM 实体。 */
export const FINANCE_MYSQL_ENTITIES = [TbFinanceBrand, TbFinanceCurrency, TbFinanceCurrencyExchange, TbFinanceCountry, TbFinanceFrozenSms]
