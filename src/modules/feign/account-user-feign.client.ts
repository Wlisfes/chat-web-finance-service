import { FeignClient, FeignGet, FeignHeader, FeignQuery } from '@wlisfes/chat-web-base-schema/feign'
import type { AccountUserSummary } from '@/modules/feign/account-user-feign.interface'

/**账号服务用户查询 Feign 客户端。*/
@FeignClient({
    name: '账号服务',
    baseUrlConfigKey: 'feign.chat-web-account.url',
    timeoutConfigKey: 'feign.chat-web-account.timeout'
})
export class AccountUserFeignClient {
    @FeignGet('/user/resolver')
    resolveUser(@FeignHeader('authorization') _authorization: string, @FeignQuery('uid') _uid: string): Promise<AccountUserSummary> {
        throw new Error('AccountUserFeignClient 必须由 FeignModule 注入')
    }
}
