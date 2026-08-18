import { DynamicModule, Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NACOS_OPTIONS, NacosService as NestNacosService } from '@sch_cat/nest-nacos-config'
import { NacosService } from '@/modules/nacos/nacos.service'

@Global()
@Module({})
export class NacosModule {
    static forRoot(): DynamicModule {
        return {
            module: NacosModule,
            imports: [ConfigModule],
            providers: [
                {
                    provide: NACOS_OPTIONS,
                    inject: [ConfigService],
                    useFactory: (configService: ConfigService) => ({
                        serverAddr: configService.get<string>('NACOS_SERVER', '127.0.0.1:8848'),
                        namespace: configService.get<string>('NACOS_NAMESPACE', 'public'),
                        requestTimeout: 5000
                    })
                },
                NestNacosService,
                NacosService
            ],
            exports: [NestNacosService, NacosService]
        }
    }
}
