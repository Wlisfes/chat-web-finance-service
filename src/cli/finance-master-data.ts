import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, loadFinanceDatabaseConfig, loadLocalEnvironment } from '@/cli/database-config'

import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
export const FINANCE_COMMON_CURRENCIES = [
    { currency: 'USD', name: '美元', symbol: '$', rate: 1 },
    { currency: 'EUR', name: '欧元', symbol: '€', rate: 0.92 },
    { currency: 'CNY', name: '中国人民币', symbol: '¥', rate: 7.2 },
    { currency: 'JPY', name: '日元', symbol: '¥', rate: 146.5 },
    { currency: 'GBP', name: '英镑', symbol: '£', rate: 0.79 },
    { currency: 'CHF', name: '瑞士法郎', symbol: 'CHF', rate: 0.88 },
    { currency: 'CAD', name: '加拿大元', symbol: 'C$', rate: 1.36 },
    { currency: 'AUD', name: '澳大利亚元', symbol: 'A$', rate: 1.51 },
    { currency: 'HKD', name: '港币', symbol: 'HK$', rate: 7.82 },
    { currency: 'SGD', name: '新加坡元', symbol: 'S$', rate: 1.34 },
    { currency: 'NZD', name: '新西兰元', symbol: 'NZ$', rate: 1.62 },
    { currency: 'INR', name: '印度卢比', symbol: '₹', rate: 83.5 },
    { currency: 'BRL', name: '巴西雷亚尔', symbol: 'R$', rate: 5.5 },
    { currency: 'RUB', name: '俄罗斯卢布', symbol: '₽', rate: 90 },
    { currency: 'KRW', name: '韩元', symbol: '₩', rate: 1335 },
    { currency: 'MXN', name: '墨西哥比索', symbol: 'MX$', rate: 18.5 },
    { currency: 'ZAR', name: '南非兰特', symbol: 'R', rate: 18.3 },
    { currency: 'AED', name: '阿联酋迪拉姆', symbol: 'د.إ', rate: 3.6725 },
    { currency: 'SAR', name: '沙特里亚尔', symbol: 'ر.س', rate: 3.75 },
    { currency: 'THB', name: '泰铢', symbol: '฿', rate: 35.4 },
    { currency: 'IDR', name: '印度尼西亚卢比', symbol: 'Rp', rate: 15800 },
    { currency: 'MYR', name: '马来西亚林吉特', symbol: 'RM', rate: 4.46 },
    { currency: 'VND', name: '越南盾', symbol: '₫', rate: 24850 },
    { currency: 'PHP', name: '菲律宾比索', symbol: '₱', rate: 56.3 },
    { currency: 'PLN', name: '波兰兹罗提', symbol: 'zł', rate: 4 },
    { currency: 'NOK', name: '挪威克朗', symbol: 'kr', rate: 10.6 },
    { currency: 'SEK', name: '瑞典克朗', symbol: 'kr', rate: 10.8 },
    { currency: 'DKK', name: '丹麦克朗', symbol: 'kr', rate: 6.95 }
] as const

async function tableExists(connection: Connection, database: string, table: string): Promise<boolean> {
    const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [database, table]
    )
    return Number(rows[0].count) === 1
}

export function shouldApplyFinanceMasterData(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--apply')
}

export function shouldSyncFinanceCurrencies(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--sync-currencies')
}

/**
 * 将常用币种补充到已有的 Finance 数据库。
 *
 * 该操作只新增缺失的币种，不会清空或重置已有业务表，也不会覆盖已有币种的启用/禁用状态。
 */
export async function syncFinanceCurrencies(
    connection: Connection,
    database: string,
    apply: boolean,
    currencies = FINANCE_COMMON_CURRENCIES
): Promise<number> {
    if (!(await tableExists(connection, database, 'tb_finance_currency'))) {
        throw new Error('常用币种写入目标表不存在：tb_finance_currency')
    }
    if (!apply) return currencies.length

    const sql = `INSERT INTO \`tb_finance_currency\` (\`currency\`, \`name\`, \`symbol\`, \`status\`, \`create_by\`, \`modify_by\`)
        VALUES (?, ?, ?, 'enable', '0', '0')
        ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`symbol\` = VALUES(\`symbol\`)`
    await connection.beginTransaction()
    try {
        for (const item of currencies) {
            await connection.execute<ResultSetHeader>(sql, [item.currency, item.name, item.symbol])
        }
        await connection.commit()
        return currencies.length
    } catch (error) {
        await connection.rollback()
        throw error
    }
}

async function main(): Promise<void> {
    loadLocalEnvironment()
    const argumentsList = process.argv.slice(2)
    const apply = shouldApplyFinanceMasterData(argumentsList)
    const syncCurrencies = shouldSyncFinanceCurrencies(argumentsList)
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
        if (syncCurrencies) {
            const count = await syncFinanceCurrencies(connection, database, apply)
            process.stdout.write(
                `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: 'tb_finance_currency', database, count }, null, 2)}\n`
            )
        } else {
            throw new Error('必须指定 --sync-currencies；国家/地区基础数据已迁移到 Skyline 服务维护')
        }
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
