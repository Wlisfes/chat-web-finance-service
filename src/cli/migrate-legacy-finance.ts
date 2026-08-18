import mysql, { Connection, RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, identifier, loadFinanceDatabaseConfig, loadLocalEnvironment } from '@/cli/database-config'

export const TABLE_MIGRATIONS = [
    {
        source: 'tb_windows_brand',
        target: 'tb_finance_brand',
        columns: 'key_id,name,document,status,create_by,modify_by,create_time,modify_time',
        select: 'key_id,name,document,status,create_by,modify_by,create_time,modify_time'
    },
    {
        source: 'tb_windows_currency',
        target: 'tb_finance_currency',
        columns: 'key_id,currency,name,symbol,status,create_time,modify_time',
        select: 'key_id,currency,name,symbol,status,create_time,modify_time'
    },
    {
        source: 'tb_windows_currency_exchange',
        target: 'tb_finance_currency_exchange',
        columns: 'key_id,currency,rate,rate_date,create_time,modify_time',
        select: 'key_id,currency,rate,date,create_time,modify_time'
    },
    {
        source: 'tb_windows_country',
        target: 'tb_finance_country',
        columns: 'key_id,code,mcc,cn_name,en_name,status,create_time,modify_time',
        select: 'key_id,code,mcc,cn_name,en_name,status,create_time,modify_time'
    },
    {
        source: 'tb_windows_client',
        target: 'tb_finance_client',
        columns:
            'key_id,owner_user_uid,name,alias,brand_key_id,currency,email,phone,status,pay_mode,class_type,balance,balance_usd,credit,credit_usd,level,stage,auth_status,source,remark,create_time,modify_time',
        select: 'key_id,userId,name,alias,brand_id,currency,email,phone,status,pay_mode,class_type,balance,balance_usd,credit,credit_usd,level,stage,auth_status,source,remark,create_time,modify_time'
    },
    {
        source: 'tb_windows_client_tags',
        target: 'tb_finance_client_tag',
        columns: 'key_id,client_key_id,tag_name,create_by,modify_by,create_time,modify_time',
        select: 'key_id,client_id,tag_name,create_by,modify_by,create_time,modify_time'
    },
    {
        source: 'tb_windows_client_share',
        target: 'tb_finance_client_share',
        columns: 'key_id,client_key_id,shared_user_uid,create_by,modify_by,create_time,modify_time',
        select: 'key_id,client_id,userId,create_by,modify_by,create_time,modify_time'
    },
    {
        source: 'tb_windows_client_settings',
        target: 'tb_finance_client_settings',
        columns: 'key_id,client_key_id,sms_active,sms_max,mail_active,mail_max,social_active,social_max,create_time,modify_time',
        select: 'key_id,client_id,sms_active,sms_max,main_active,main_max,meta_active,meta_max,create_time,modify_time'
    },
    {
        source: 'tb_windows_basic_sms_rate',
        target: 'tb_finance_basic_sms_rate',
        columns: 'key_id,code,mcc,up_usd,down_usd,remark,create_by,modify_by,create_time,modify_time',
        select: 'key_id,code,mcc,up_usd,down_usd,remark,create_by,modify_by,create_time,modify_time'
    }
] as const

export type TableMigration = (typeof TABLE_MIGRATIONS)[number]

async function tableExists(connection: Connection, database: string, table: string): Promise<boolean> {
    const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [database, table]
    )
    return Number(rows[0].count) === 1
}

async function rowCount(connection: Connection, database: string, table: string): Promise<number> {
    const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(`SELECT COUNT(*) count FROM \`${database}\`.\`${table}\``)
    return Number(rows[0].count)
}

export function shouldApplyMigration(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--apply')
}

export function buildInsertSelectSql(migration: TableMigration, sourceDatabase: string, targetDatabase: string): string {
    const targetColumns = migration.columns
        .split(',')
        .map(column => `\`${column}\``)
        .join(',')
    const sourceColumns = migration.select
        .split(',')
        .map(column => `\`${column}\``)
        .join(',')
    return `INSERT INTO \`${targetDatabase}\`.\`${migration.target}\` (${targetColumns}) SELECT ${sourceColumns} FROM \`${sourceDatabase}\`.\`${migration.source}\``
}

export async function migrateLegacyTables(
    connection: Connection,
    sourceDatabase: string,
    targetDatabase: string,
    apply: boolean
): Promise<Record<string, number>> {
    const available: TableMigration[] = []
    for (const migration of TABLE_MIGRATIONS) {
        if (!(await tableExists(connection, sourceDatabase, migration.source))) continue
        if (!(await tableExists(connection, targetDatabase, migration.target))) throw new Error(`目标表不存在：${migration.target}`)
        if ((await rowCount(connection, targetDatabase, migration.target)) > 0) throw new Error(`目标表非空：${migration.target}`)
        available.push(migration)
    }
    if (!available.length) throw new Error(`旧财务库 ${sourceDatabase} 中未发现 tb_windows_* 财务表`)

    await connection.beginTransaction()
    try {
        const counts: Record<string, number> = {}
        for (const migration of available) {
            const sourceCount = await rowCount(connection, sourceDatabase, migration.source)
            await connection.query(buildInsertSelectSql(migration, sourceDatabase, targetDatabase))
            counts[migration.target] = sourceCount
        }
        if (apply) await connection.commit()
        else await connection.rollback()
        return counts
    } catch (error) {
        await connection.rollback()
        throw error
    }
}

async function main(): Promise<void> {
    loadLocalEnvironment()
    const apply = shouldApplyMigration(process.argv.slice(2))
    const sourceDatabase = identifier(process.env.LEGACY_FINANCE_DATABASE?.trim() || 'legacy_windows', '旧财务数据库名称')
    const config = await loadFinanceDatabaseConfig()
    const targetDatabase = getDatabaseName(config)
    if (sourceDatabase === targetDatabase) throw new Error('旧财务库和目标财务库不能相同')
    const connection = await mysql.createConnection({
        host: process.env.FINANCE_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.FINANCE_MYSQL_PORT || config.port || 3306),
        user: process.env.FINANCE_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.FINANCE_MYSQL_PASSWORD ?? config.password,
        database: targetDatabase,
        charset: config.charset || 'utf8mb4'
    })
    try {
        const counts = await migrateLegacyTables(connection, sourceDatabase, targetDatabase, apply)
        process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sourceDatabase, targetDatabase, counts }, null, 2)}\n`)
    } finally {
        await connection.end()
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
