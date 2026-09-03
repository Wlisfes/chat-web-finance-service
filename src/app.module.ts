import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AccountRemoteAuthModule } from '@wlisfes/chat-web-base-schema/auth'
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
import { FeignConfigModule } from '@/modules/feign/feign-config.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        FeignConfigModule,
        RedisModule,
        DatabaseModule,
        AccountRemoteAuthModule,
        HealthModule,
        BrandModule,
        CurrencyModule,
        CountryModule,
        SmsRateModule
    ],
    controllers: [AppController],
    providers: [AppService, FinanceAuthGuard, { provide: APP_GUARD, useExisting: FinanceAuthGuard }]
})
export class AppModule {}
