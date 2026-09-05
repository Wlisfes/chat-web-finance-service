import { Global, Module } from '@nestjs/common'
import { FeignClientAccountManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'

@Global()
@Module({
    imports: [FeignModule.register([FeignClientAccountManager])],
    exports: [FeignModule]
})
export class IntegrationModule {}
