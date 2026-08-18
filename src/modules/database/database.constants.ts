import {
    TbFinanceBasicSmsRate,
    TbFinanceBrand,
    TbFinanceClient,
    TbFinanceClientSettings,
    TbFinanceClientShare,
    TbFinanceClientTag,
    TbFinanceCountry,
    TbFinanceCurrency,
    TbFinanceCurrencyExchange
} from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'

export const FINANCE_MYSQL_CONFIG_KEY = 'database.chat-web-finance'

export const FINANCE_MYSQL_ENTITIES = [
    TbFinanceBrand,
    TbFinanceCurrency,
    TbFinanceCurrencyExchange,
    TbFinanceCountry,
    TbFinanceClient,
    TbFinanceClientTag,
    TbFinanceClientShare,
    TbFinanceClientSettings,
    TbFinanceBasicSmsRate
]
