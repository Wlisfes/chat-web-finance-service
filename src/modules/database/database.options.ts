import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { FINANCE_MYSQL_CONFIG_KEY, FINANCE_MYSQL_ENTITIES } from '@/modules/database/database.constants'
import { FinanceMysqlConfig } from '@/modules/database/database.interface'

type ConfigRecord = Record<keyof FinanceMysqlConfig, unknown>

function requiredString(config: ConfigRecord, key: keyof FinanceMysqlConfig): string {
    const value = config[key]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${FINANCE_MYSQL_CONFIG_KEY}.${key} 必须是非空字符串`)
    return value.trim()
}

function optionalString(config: ConfigRecord, key: keyof FinanceMysqlConfig, fallback: string): string {
    const value = config[key]
    return value === undefined || value === null || value === '' ? fallback : requiredString(config, key)
}

function integer(
    config: ConfigRecord,
    key: keyof FinanceMysqlConfig,
    fallback: number,
    minimum: number,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const configured = config[key]
    const value = configured === undefined || configured === null || configured === '' ? fallback : Number(configured)
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${FINANCE_MYSQL_CONFIG_KEY}.${key} 格式错误`)
    return value
}

function boolean(config: ConfigRecord, key: keyof FinanceMysqlConfig, fallback: boolean): boolean {
    const value = config[key]
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === 'false') return value === 'true'
    throw new Error(`${FINANCE_MYSQL_CONFIG_KEY}.${key} 必须是布尔值`)
}

function env(configService: ConfigService, key: string): string | undefined {
    const value = configService.get<string>(key)
    return value?.trim() || undefined
}

export function createFinanceMysqlOptions(configService: ConfigService): TypeOrmModuleOptions {
    const configured = configService.get<unknown>(FINANCE_MYSQL_CONFIG_KEY)
    if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
        throw new Error(`缺少 Nacos 数据库配置节点：${FINANCE_MYSQL_CONFIG_KEY}`)
    }
    const config = configured as ConfigRecord
    const database = env(configService, 'FINANCE_MYSQL_DATABASE') || String(config.database || config.name || '').trim()
    if (!database) throw new Error('财务数据库名称不能为空')
    return {
        type: 'mysql',
        connectorPackage: 'mysql2',
        host: env(configService, 'FINANCE_MYSQL_HOST') || requiredString(config, 'host'),
        port: Number(env(configService, 'FINANCE_MYSQL_PORT') || integer(config, 'port', 3306, 1, 65535)),
        username: env(configService, 'FINANCE_MYSQL_USERNAME') || requiredString(config, 'username'),
        password: configService.get<string>('FINANCE_MYSQL_PASSWORD') ?? requiredString(config, 'password'),
        database,
        charset: optionalString(config, 'charset', 'utf8mb4'),
        timezone: optionalString(config, 'timezone', '+08:00'),
        logging: boolean(config, 'logging', false),
        poolSize: integer(config, 'poolSize', 10, 1, 1000),
        connectTimeout: integer(config, 'connectTimeout', 10000, 1),
        retryAttempts: integer(config, 'retryAttempts', 5, 0, 100),
        retryDelay: integer(config, 'retryDelay', 3000, 0),
        supportBigNumbers: true,
        bigNumberStrings: true,
        extra: { decimalNumbers: true },
        entities: [...FINANCE_MYSQL_ENTITIES],
        synchronize: false,
        migrationsRun: false
    }
}
