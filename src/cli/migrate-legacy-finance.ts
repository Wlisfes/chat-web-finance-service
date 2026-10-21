import mysql, { Connection, RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, identifier, loadFinanceDatabaseConfig, loadLocalEnvironment, loadNacosConfig } from '@/cli/database-config'

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
        columns: 'key_id,currency,name,symbol,status,create_by,modify_by,create_time,modify_time',
        select: "key_id,currency,name,symbol,status,'0','0',create_time,modify_time"
    },
    {
        source: 'tb_windows_currency_exchange',
        target: 'tb_finance_currency_exchange',
        columns: 'key_id,currency,rate,date,create_by,modify_by,create_time,modify_time',
        select: "key_id,currency,rate,date,'0','0',create_time,modify_time"
    },

    {
        source: 'tb_windows_basic_sms_rate',
        target: 'tb_finance_frozen_sms',
        // 国家/地区主键由 Skyline Feign 按区号和 MCC 解析后替换 {countryKeyId}，不再查询旧表 tb_finance_country。
        columns: 'key_id,country_key_id,code,mcc,up_usd,down_usd,remark,create_by,modify_by,create_time,modify_time',
        select: 'key_id,{countryKeyId},code,mcc,up_usd,down_usd,remark,create_by,modify_by,create_time,modify_time'
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

export type CountryCodeRef = { code: string; mcc: string; keyId: number }

/** 用 Skyline 返回的国家/地区主键生成关联子查询，避免再读 Finance 旧表。 */
export function buildCountryKeyIdSql(countries: CountryCodeRef[]): string {
    if (countries.length === 0) throw new Error('没有可回填的国家/地区')
    const rows = countries.map(item => {
        const code = item.code.trim()
        const mcc = item.mcc.trim()
        if (!/^[0-9]{1,10}$/.test(code) || !/^[0-9]{1,4}$/.test(mcc) || !Number.isInteger(item.keyId) || item.keyId < 1) {
            throw new Error(`国家/地区映射无效：${code}/${mcc}`)
        }
        return `SELECT '${code}' AS \`code\`, '${mcc}' AS \`mcc\`, ${item.keyId} AS \`key_id\``
    })
    return `(SELECT \`mapping\`.\`key_id\` FROM (${rows.join(' UNION ALL ')}) AS \`mapping\` WHERE \`mapping\`.\`code\` = \`legacy\`.\`code\` AND \`mapping\`.\`mcc\` = \`legacy\`.\`mcc\`)`
}

export function buildInsertSelectSql(
    migration: TableMigration,
    sourceDatabase: string,
    targetDatabase: string,
    countries: CountryCodeRef[] = []
): string {
    const targetColumns = migration.columns
        .split(',')
        .map(column => `\`${column}\``)
        .join(',')
    // 旧表缺失的字段以单引号字面量或括号子查询回填，表达式不加反引号；子查询中的 {targetDatabase} 替换为目标库名。
    const sourceColumns = migration.select
        .split(',')
        .map(column => {
            if (column === '{countryKeyId}') return countries.length ? buildCountryKeyIdSql(countries) : 'NULL'
            if (column.startsWith("'") || column.startsWith('(')) return column.replaceAll('{targetDatabase}', targetDatabase)
            return `\`legacy\`.\`${column}\``
        })
        .join(',')
    return `INSERT INTO \`${targetDatabase}\`.\`${migration.target}\` (${targetColumns}) SELECT ${sourceColumns} FROM \`${sourceDatabase}\`.\`${migration.source}\` AS \`legacy\``
}

export type CountryCodeResolver = (items: Array<Pick<CountryCodeRef, 'code' | 'mcc'>>) => Promise<CountryCodeRef[]>

async function resolveLegacyCountries(
    connection: Connection,
    sourceDatabase: string,
    resolveCountries: CountryCodeResolver
): Promise<CountryCodeRef[]> {
    const [rows] = await connection.query<Array<RowDataPacket & { code: string; mcc: string }>>(
        `SELECT DISTINCT \`code\`, \`mcc\` FROM \`${sourceDatabase}\`.\`tb_windows_basic_sms_rate\``
    )
    const items = rows.map(row => ({ code: String(row.code), mcc: String(row.mcc) }))
    if (items.length === 0) return []
    const countries = await resolveCountries(items)
    const missing = items.filter(item => !countries.some(country => country.code === item.code && country.mcc === item.mcc))
    if (missing.length > 0) {
        throw new Error(`Skyline 未找到国家/地区：${missing.map(item => `${item.code}/${item.mcc}`).join('、')}`)
    }
    return countries
}

export async function migrateLegacyTables(
    connection: Connection,
    sourceDatabase: string,
    targetDatabase: string,
    apply: boolean,
    resolveCountries: CountryCodeResolver = async () => []
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
            const countries =
                migration.source === 'tb_windows_basic_sms_rate'
                    ? await resolveLegacyCountries(connection, sourceDatabase, resolveCountries)
                    : []
            await connection.query(buildInsertSelectSql(migration, sourceDatabase, targetDatabase, countries))
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

export async function resolveCountriesByFeign(items: Array<Pick<CountryCodeRef, 'code' | 'mcc'>>): Promise<CountryCodeRef[]> {
    const config = await loadNacosConfig()
    const gateway = (config.gateway as { feign?: { url?: string; service_token?: string } } | undefined)?.feign
    const baseUrl = gateway?.url?.trim()
    const token = gateway?.service_token?.trim().replace(/^Bearer\s+/i, '')
    if (!baseUrl || !token) throw new Error('Nacos 配置 gateway.feign.url 或 gateway.feign.service_token 未配置')
    const countries: CountryCodeRef[] = []
    for (let index = 0; index < items.length; index += 100) {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/feign/skyline/country/column/code/resolve`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ items: items.slice(index, index + 100) })
        })
        const body = (await response.json()) as { code?: number; message?: string; data?: CountryCodeRef[] }
        if (!response.ok || body.code !== 200 || !Array.isArray(body.data)) {
            throw new Error(body.message || `Skyline 国家/地区 Feign 调用失败：HTTP ${response.status}`)
        }
        countries.push(...body.data)
    }
    return countries
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
        const counts = await migrateLegacyTables(connection, sourceDatabase, targetDatabase, apply, resolveCountriesByFeign)
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
