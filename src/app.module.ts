import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { BrandModule } from '@/modules/brand/brand.module'
import { CountryModule } from '@/modules/country/country.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/database/database.module'
import { HealthModule } from '@/health/health.module'
import { FrozenModule } from '@/modules/frozen/frozen.module'
import { FeignModule } from '@/feign/feign.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RedisModule,
        DatabaseModule,
        GatewayPrincipalModule,
        AuthorizationModule,
        HealthModule,
        BrandModule,
        CurrencyModule,
        CountryModule,
        FrozenModule,
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
