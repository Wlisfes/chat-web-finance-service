import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { AuthModule } from '@/modules/auth/auth.module'
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard'
import { BrandModule } from '@/modules/brand/brand.module'
import { ClientModule } from '@/modules/client/client.module'
import { CountryModule } from '@/modules/country/country.module'
import { CurrencyModule } from '@/modules/currency/currency.module'
import { DatabaseModule } from '@/modules/database/database.module'
import { HealthModule } from '@/modules/health/health.module'
import { NacosModule } from '@/modules/nacos/nacos.module'
import { RedisModule } from '@/modules/redis/redis.module'
import { SmsRateModule } from '@/modules/sms-rate/sms-rate.module'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(),
        RedisModule,
        DatabaseModule,
        AuthModule,
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
