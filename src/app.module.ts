import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtAuthGuard, SessionAuthModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { BrandModule } from '@/modules/brand/brand.module'
import { ClientModule } from '@/modules/client/client.module'
import { CountryModule } from '@/modules/country/country.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/modules/database/database.module'
import { HealthModule } from '@/modules/health/health.module'
import { SmsRateModule } from '@/modules/sms-rate/sms-rate.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot({ serviceName: 'chat-web-finance-service', defaultPort: 3010 }),
        DatabaseModule,
        SessionAuthModule,
        HealthModule,
        BrandModule,
        CurrencyModule,
        CountryModule,
        ClientModule,
        SmsRateModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }]
})
export class AppModule {}
