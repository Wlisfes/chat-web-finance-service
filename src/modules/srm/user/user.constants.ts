/** 单次批量查询供应商钱包的数量上限，与其他 Feign 批量接口一致。 */
export const SRM_USER_RESOLVE_LIMIT = 100

/** 启动补齐 Redis 钱包缓存时每批读取的钱包数量。 */
export const SRM_WALLET_CACHE_BATCH_SIZE = 500

/** Redis 未就绪导致缓存补齐失败时的重试间隔。 */
export const SRM_WALLET_CACHE_RETRY_MS = 5_000

/** 钱包哈希里的余额字段。扣费用 HINCRBY 原子增减这个字段。 */
export const SRM_WALLET_BALANCE_FIELD = 'balance'

/** 供应商钱包 Redis 哈希键前缀，不设过期时间。 */
export const SRM_WALLET_REDIS_PREFIX = 'chat-web-finance:srm:wallet'

export function srmWalletRedisKey(userKeyId: number): string {
    return `${SRM_WALLET_REDIS_PREFIX}:${userKeyId}`
}
