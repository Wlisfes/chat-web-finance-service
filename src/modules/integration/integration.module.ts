import { Global, Module } from '@nestjs/common'
import { FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { AccountUserFeignClient } from '@/modules/feign/account-user-feign.client'

@Global()
@Module({
    imports: [FeignModule.register([AccountUserFeignClient])],
    exports: [FeignModule]
})
export class IntegrationModule {}
