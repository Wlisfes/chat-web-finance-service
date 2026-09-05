import { ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FeignClientFinanceManager } from '@wlisfes/chat-web-base-schema/feign'
import { ConfigService } from '@nestjs/config'
import { FeignService } from '@/modules/feign/feign.service'

@ApifoxController('内部 Feign 接口')
export class FeignController extends FeignClientFinanceManager {
    constructor(feignService: FeignService, configService: ConfigService) {
        super(feignService, configService)
    }
}
