import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { BrandModule } from '@/modules/brand/brand.module'
import { CountryModule } from '@/modules/country/country.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/modules/database/database.module'
import { HealthModule } from '@/modules/health/health.module'
import { SmsRateModule } from '@/modules/sms-rate/sms-rate.module'
import { FinanceAuthGuard } from '@/modules/auth/finance-auth.guard'
import { FeignModule } from '@/modules/feign/feign.module'
import { IntegrationModule } from '@/modules/integration/integration.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        IntegrationModule,
        RedisModule,
        DatabaseModule,
        // 用户认证在网关完成一次；财务服务只校验网关签发的身份上下文签名。
        GatewayPrincipalModule,
        HealthModule,
        BrandModule,
        CurrencyModule,
        CountryModule,
        SmsRateModule,
        FeignModule
    ],
    controllers: [AppController],
    providers: [AppService, FinanceAuthGuard, { provide: APP_GUARD, useExisting: FinanceAuthGuard }]
})
export class AppModule {}
