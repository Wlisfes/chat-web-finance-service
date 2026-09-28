import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeignClientAccountManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { FINANCE_MYSQL_ENTITIES } from '@/database/database.constants'
import { FrozenSmsController } from '@/modules/frozen/sms/sms.controller'
import { FrozenSmsService } from '@/modules/frozen/sms/sms.service'
import { FrozenSmsUtilsService } from '@/modules/frozen/sms/sms.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([...FINANCE_MYSQL_ENTITIES]), FeignModule.register([FeignClientAccountManager])],
    controllers: [FrozenSmsController],
    providers: [FrozenSmsService, FrozenSmsUtilsService],
    exports: [FrozenSmsService]
})
export class FrozenModule {}
