/** 单次批量查询客户钱包的数量上限，与其他 Feign 批量接口一致。 */
export const CRM_USER_RESOLVE_LIMIT = 100

/** 一条 SQL 写回余额的最大行数，避免语句超过 max_allowed_packet。 */
export const CRM_WALLET_SQL_BATCH_SIZE = 1000

/** 启动补齐 Redis 钱包缓存时每批读取的钱包数量。 */
export const CRM_WALLET_CACHE_BATCH_SIZE = 500

/** Redis 未就绪导致缓存补齐失败时的重试间隔。 */
export const CRM_WALLET_CACHE_RETRY_MS = 5_000

/** 全部客户余额放在同一个哈希，field 为客户主键。 */
export const CRM_WALLET_BALANCE_KEY = 'chat-web-finance:crm:balances'

/** 全部客户信用额度放在同一个哈希，field 为客户主键。 */
export const CRM_WALLET_CREDIT_KEY = 'chat-web-finance:crm:credits'

/** 余额变化标记前缀；每个账户一个 key，Charge 写入后由 Finance 使用 GETDEL 原子认领。 */
export const CRM_WALLET_BALANCE_DIRTY_PREFIX = 'chat-web-finance:crm:balance-dirty'

export function crmWalletBalanceDirtyKey(userKeyId: number): string {
    return `${CRM_WALLET_BALANCE_DIRTY_PREFIX}:${userKeyId}`
}

/** 旧版按客户拆开的钱包哈希前缀。启动时并入总余额哈希，之后不再使用。 */
export const CRM_WALLET_REDIS_PREFIX = 'chat-web-finance:crm:wallet'

/** 旧版钱包哈希里的余额字段。 */
export const CRM_WALLET_BALANCE_FIELD = 'balance'
