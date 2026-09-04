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
                const configured = configService.get<Record<string, unknown>>(FINANCE_MYSQL_CONFIG_KEY)
                // 仅在内存中兼容 Nacos 的历史 name 字段，不修改或回写远端配置。
                if (configured && typeof configured.database !== 'string' && typeof configured.name === 'string') {
                    configService.set(FINANCE_MYSQL_CONFIG_KEY, { ...configured, database: configured.name })
                }
                return createMysqlOptions(configService, {
                    configKey: FINANCE_MYSQL_CONFIG_KEY,
                    entities: [...FINANCE_MYSQL_ENTITIES],
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
