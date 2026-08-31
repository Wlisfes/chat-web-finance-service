import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { FINANCE_MYSQL_CONFIG_KEY, FINANCE_MYSQL_ENTITIES } from '@/modules/database/database.constants'

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createMysqlOptions(configService, {
                    configKey: FINANCE_MYSQL_CONFIG_KEY,
                    entities: [...FINANCE_MYSQL_ENTITIES],
                    environmentPrefix: 'FINANCE_MYSQL',
                    environmentOverrides: ['host', 'port', 'username', 'password', 'database'],
                    decimalNumbers: true
                })
            }
        }),
        TypeOrmModule.forFeature([...FINANCE_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
