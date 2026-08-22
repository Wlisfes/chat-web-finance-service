import { Faker, zh_CN } from '@faker-js/faker'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import mysql, { Connection, RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, loadFinanceDatabaseConfig, loadLocalEnvironment } from '@/cli/database-config'

export const FINANCE_DEMO_SEED = 20260822
export const FINANCE_DEMO_RATE_DATE = '2026-08-22'
export const FINANCE_DEMO_OPERATOR_UID = '2026082200000000001'

export type FinanceDemoValue = string | number | null

export type FinanceDemoTable = {
    table: string
    columns: readonly string[]
    rows: readonly (readonly FinanceDemoValue[])[]
}

const CURRENCIES = [
    { currency: 'USD', name: '美元', symbol: '$', rate: 1 },
    { currency: 'CNY', name: '人民币', symbol: '¥', rate: 7.2 },
    { currency: 'EUR', name: '欧元', symbol: '€', rate: 0.92 },
    { currency: 'GBP', name: '英镑', symbol: '£', rate: 0.79 },
    { currency: 'SGD', name: '新加坡元', symbol: 'S$', rate: 1.34 },
    { currency: 'INR', name: '印度卢比', symbol: '₹', rate: 83.5 },
    { currency: 'JPY', name: '日元', symbol: '¥', rate: 146.5 },
    { currency: 'KRW', name: '韩元', symbol: '₩', rate: 1335 },
    { currency: 'IDR', name: '印度尼西亚卢比', symbol: 'Rp', rate: 15800 },
    { currency: 'THB', name: '泰铢', symbol: '฿', rate: 35.4 },
    { currency: 'MYR', name: '马来西亚林吉特', symbol: 'RM', rate: 4.46 },
    { currency: 'VND', name: '越南盾', symbol: '₫', rate: 24850 },
    { currency: 'PHP', name: '菲律宾比索', symbol: '₱', rate: 56.3 }
] as const

const COUNTRIES = [
    { code: '+86', mcc: '460', cnName: '中国', enName: 'China' },
    { code: '+1', mcc: '310', cnName: '美国', enName: 'United States' },
    { code: '+44', mcc: '234', cnName: '英国', enName: 'United Kingdom' },
    { code: '+65', mcc: '525', cnName: '新加坡', enName: 'Singapore' },
    { code: '+91', mcc: '404', cnName: '印度', enName: 'India' },
    { code: '+81', mcc: '440', cnName: '日本', enName: 'Japan' },
    { code: '+82', mcc: '450', cnName: '韩国', enName: 'South Korea' },
    { code: '+62', mcc: '510', cnName: '印度尼西亚', enName: 'Indonesia' },
    { code: '+66', mcc: '520', cnName: '泰国', enName: 'Thailand' },
    { code: '+60', mcc: '502', cnName: '马来西亚', enName: 'Malaysia' },
    { code: '+84', mcc: '452', cnName: '越南', enName: 'Vietnam' },
    { code: '+63', mcc: '515', cnName: '菲律宾', enName: 'Philippines' }
] as const

function variedRate(faker: Faker, rate: number): number {
    if (rate === 1) return rate
    const basisPoints = faker.number.int({ min: -150, max: 150 })
    return Number((rate * (1 + basisPoints / 10000)).toFixed(6))
}

export function createFinanceDemoTables(seed = FINANCE_DEMO_SEED, rateDate = FINANCE_DEMO_RATE_DATE): readonly FinanceDemoTable[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rateDate)) throw new Error('演示汇率日期必须使用 YYYY-MM-DD 格式')
    const faker = new Faker({ locale: zh_CN })
    faker.seed(seed)
    const brands = Array.from({ length: 12 }, (_, index) => [
        `演示品牌-${String(index + 1).padStart(2, '0')}-${faker.string.alphanumeric(6).toUpperCase()}`,
        `${faker.company.name()}：${faker.helpers.arrayElement(['跨境通信演示品牌', '企业消息演示品牌', '国际短信演示品牌'])}`.slice(
            0,
            1024
        ),
        index === 11 ? 'disable' : 'enable',
        FINANCE_DEMO_OPERATOR_UID,
        FINANCE_DEMO_OPERATOR_UID
    ])
    const currencies = CURRENCIES.map(item => [item.currency, item.name, item.symbol, 'enable'])
    const exchanges = CURRENCIES.map(item => [item.currency, variedRate(faker, item.rate), rateDate])
    const countries = COUNTRIES.map(item => [item.code, item.mcc, item.cnName, item.enName, 'enable'])
    const smsRates = COUNTRIES.map(item => {
        const upUsd = faker.number.int({ min: 5000, max: 65000 })
        const downUsd = upUsd + faker.number.int({ min: 5000, max: 85000 })
        const remark = faker.helpers.arrayElement(['演示运营商基础价', '演示国际短信参考价', '演示区域路由基础价'])
        return [item.code, item.mcc, upUsd, downUsd, remark, FINANCE_DEMO_OPERATOR_UID, FINANCE_DEMO_OPERATOR_UID]
    })

    return [
        {
            table: 'tb_finance_brand',
            columns: ['name', 'document', 'status', 'create_by', 'modify_by'],
            rows: brands
        },
        {
            table: 'tb_finance_currency',
            columns: ['currency', 'name', 'symbol', 'status'],
            rows: currencies
        },
        {
            table: 'tb_finance_currency_exchange',
            columns: ['currency', 'rate', 'rate_date'],
            rows: exchanges
        },
        {
            table: 'tb_finance_country',
            columns: ['code', 'mcc', 'cn_name', 'en_name', 'status'],
            rows: countries
        },
        {
            table: 'tb_finance_basic_sms_rate',
            columns: ['code', 'mcc', 'up_usd', 'down_usd', 'remark', 'create_by', 'modify_by'],
            rows: smsRates
        }
    ]
}

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

function insertSql(table: FinanceDemoTable): string {
    const columns = table.columns.map(column => `\`${column}\``).join(',')
    const placeholders = table.columns.map(() => '?').join(',')
    return `INSERT INTO \`${table.table}\` (${columns}) VALUES (${placeholders})`
}

export function shouldApplyFinanceDemoSeed(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--apply')
}

export async function seedFinanceDemoData(
    connection: Connection,
    database: string,
    apply: boolean,
    tables = createFinanceDemoTables()
): Promise<Record<string, number>> {
    const counts = Object.fromEntries(tables.map(table => [table.table, table.rows.length]))
    for (const table of tables) {
        if (!(await tableExists(connection, database, table.table))) throw new Error(`演示数据目标表不存在：${table.table}`)
        if ((await rowCount(connection, database, table.table)) > 0) throw new Error(`演示数据目标表非空：${table.table}`)
    }
    if (!apply) return counts

    await connection.beginTransaction()
    try {
        for (const table of tables) {
            const sql = insertSql(table)
            for (const row of table.rows) await connection.execute(sql, [...row])
        }
        await connection.commit()
        return counts
    } catch (error) {
        await connection.rollback()
        throw error
    }
}

async function main(): Promise<void> {
    loadLocalEnvironment()
    const apply = shouldApplyFinanceDemoSeed(process.argv.slice(2))
    const config = await loadFinanceDatabaseConfig()
    const database = getDatabaseName(config)
    const connection = await mysql.createConnection({
        host: process.env.FINANCE_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.FINANCE_MYSQL_PORT || config.port || 3306),
        user: process.env.FINANCE_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.FINANCE_MYSQL_PASSWORD ?? config.password,
        database,
        charset: process.env.FINANCE_MYSQL_CHARSET || config.charset || 'utf8mb4'
    })
    try {
        const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
        assertMysqlDatabaseIsolation(
            grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string')),
            database
        )
        const rateDate = process.env.FINANCE_DEMO_RATE_DATE?.trim() || FINANCE_DEMO_RATE_DATE
        const tables = createFinanceDemoTables(FINANCE_DEMO_SEED, rateDate)
        const counts = await seedFinanceDemoData(connection, database, apply, tables)
        process.stdout.write(
            `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', seed: FINANCE_DEMO_SEED, rateDate, database, counts }, null, 2)}\n`
        )
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
