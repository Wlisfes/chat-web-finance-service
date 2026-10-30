/** 单次批量查询供应商钱包的数量上限，与其他 Feign 批量接口一致。 */
export const SRM_USER_RESOLVE_LIMIT = 100

/** 一条 SQL 写回余额的最大行数，避免语句超过 max_allowed_packet。 */
export const SRM_WALLET_SQL_BATCH_SIZE = 1000

/** 启动补齐 Redis 钱包缓存时每批读取的钱包数量。 */
export const SRM_WALLET_CACHE_BATCH_SIZE = 500

/** Redis 未就绪导致缓存补齐失败时的重试间隔。 */
export const SRM_WALLET_CACHE_RETRY_MS = 5_000

/** 全部供应商余额放在同一个哈希，field 为供应商主键。 */
export const SRM_WALLET_BALANCE_KEY = 'chat-web-finance:srm:balances'

/** 全部供应商信用额度放在同一个哈希，field 为供应商主键。 */
export const SRM_WALLET_CREDIT_KEY = 'chat-web-finance:srm:credits'

/** 余额变化标记前缀；每个账户一个 key，Charge 写入后由 Finance 使用 GETDEL 原子认领。 */
export const SRM_WALLET_BALANCE_DIRTY_PREFIX = 'chat-web-finance:srm:balance-dirty'

export function srmWalletBalanceDirtyKey(userKeyId: number): string {
    return `${SRM_WALLET_BALANCE_DIRTY_PREFIX}:${userKeyId}`
}

/** 旧版按供应商拆开的钱包哈希前缀。启动时并入总余额哈希，之后不再使用。 */
export const SRM_WALLET_REDIS_PREFIX = 'chat-web-finance:srm:wallet'

/** 旧版钱包哈希里的余额字段。 */
export const SRM_WALLET_BALANCE_FIELD = 'balance'
