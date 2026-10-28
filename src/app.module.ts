import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { RabbitmqModule, setupSrmUserBillingTopology } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { BrandModule } from '@/modules/brand/brand.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/database/database.module'
import { HealthModule } from '@/health/health.module'
import { FrozenModule } from '@/modules/frozen/frozen.module'
import { FeignModule } from '@/feign/feign.module'
import { SrmUserModule } from '@/modules/srm-user/srm-user.module'

/** 供应商计费事件所在的 RabbitMQ 虚拟主机，与 Dispatch 一致；Nacos `rabbitmq.vhost` 必须是这个值。 */
const SMS_RABBITMQ_VHOST = '/chat-sms'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RedisModule,
        RabbitmqModule.forRoot({ vhost: SMS_RABBITMQ_VHOST, setup: setupSrmUserBillingTopology }),
        DatabaseModule,
        GatewayPrincipalModule,
        AuthorizationModule,
        HealthModule,
        BrandModule,
        CurrencyModule,
        FrozenModule,
        SrmUserModule,
        FeignModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useExisting: GatewayPrincipalGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard }
    ]
})
export class AppModule {}
