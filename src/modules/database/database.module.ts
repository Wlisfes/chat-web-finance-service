import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FINANCE_MYSQL_ENTITIES } from '@/modules/database/database.constants'
import { createFinanceMysqlOptions } from '@/modules/database/database.options'
import { NacosService } from '@/modules/nacos/nacos.service'

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createFinanceMysqlOptions(configService)
            }
        }),
        TypeOrmModule.forFeature([...FINANCE_MYSQL_ENTITIES])
    ],
    exports: [TypeOrmModule]
})
export class DatabaseModule {}
