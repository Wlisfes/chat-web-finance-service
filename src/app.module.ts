import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AccountRemoteAuthModule, JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { createNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { BrandModule } from '@/modules/brand/brand.module'
import { CountryModule } from '@/modules/country/country.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/modules/database/database.module'
import { HealthModule } from '@/modules/health/health.module'
import { SmsRateModule } from '@/modules/sms-rate/sms-rate.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(
            createNacosRuntimeOptions({
                serviceName: 'chat-web-finance-service',
                registerPort: process.env.PORT,
                NACOS_SERVER: process.env.NACOS_SERVER,
                NACOS_NAMESPACE: process.env.NACOS_NAMESPACE,
                NACOS_USERNAME: process.env.NACOS_USERNAME,
                NACOS_PASSWORD: process.env.NACOS_PASSWORD,
                NACOS_REQUEST_TIMEOUT: process.env.NACOS_REQUEST_TIMEOUT,
                NACOS_CONFIG_DATA_ID: process.env.NACOS_CONFIG_DATA_ID,
                NACOS_CONFIG_GROUP: process.env.NACOS_CONFIG_GROUP,
                NACOS_REGISTER_ENABLED: process.env.NACOS_REGISTER_ENABLED,
                NACOS_REGISTER_REQUIRED: process.env.NACOS_REGISTER_REQUIRED,
                NACOS_SERVICE_NAME: process.env.NACOS_SERVICE_NAME,
                NACOS_GROUP: process.env.NACOS_GROUP,
                NACOS_REGISTER_IP: process.env.NACOS_REGISTER_IP,
                NACOS_REGISTER_PORT: process.env.NACOS_REGISTER_PORT
            })
        ),
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
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }]
})
export class AppModule {}
