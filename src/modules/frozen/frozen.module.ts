import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeignClientSkylineManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { FINANCE_MYSQL_ENTITIES } from '@/database/database.constants'
import { FrozenSmsController } from '@/modules/frozen/sms/sms.controller'
import { FrozenSmsService } from '@/modules/frozen/sms/sms.service'
import { FrozenSmsUtilsService } from '@/modules/frozen/sms/sms.utils.service'
import { FrozenSimbankController } from '@/modules/frozen/simbank/simbank.controller'
import { FrozenSimbankService } from '@/modules/frozen/simbank/simbank.service'
import { FrozenSimbankUtilsService } from '@/modules/frozen/simbank/simbank.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([...FINANCE_MYSQL_ENTITIES]), FeignModule.register([FeignClientSkylineManager])],
    controllers: [FrozenSmsController, FrozenSimbankController],
    providers: [FrozenSmsService, FrozenSmsUtilsService, FrozenSimbankService, FrozenSimbankUtilsService],
    exports: [FrozenSmsUtilsService, FrozenSimbankUtilsService]
})
export class FrozenModule {}
