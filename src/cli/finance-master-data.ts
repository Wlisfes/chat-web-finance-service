import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, loadFinanceDatabaseConfig, loadLocalEnvironment } from '@/cli/database-config'
import { FINANCE_COUNTRY_DATA } from '@/cli/finance-country-data'

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

export function shouldSyncFinanceCountries(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--sync-countries')
}

async function prefixedCodeConflictCount(
    connection: Connection,
    table: 'tb_finance_country' | 'tb_finance_basic_sms_rate'
): Promise<number> {
    const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count
        FROM \`${table}\` legacy
        INNER JOIN \`${table}\` normalized
            ON normalized.\`code\` = TRIM(LEADING '+' FROM legacy.\`code\`)
            AND normalized.\`mcc\` = legacy.\`mcc\`
        WHERE legacy.\`code\` LIKE '+%'`
    )
    return Number(rows[0].count)
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

    const sql = `INSERT INTO \`tb_finance_currency\` (\`currency\`, \`name\`, \`symbol\`, \`status\`)
        VALUES (?, ?, ?, 'enable')
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

/**
 * 将国家/地区主数据补充到 Finance 数据库。
 *
 * 以国际区号和代表 MCC 作为唯一键，重复执行只同步名称，不会生成重复数据或覆盖人工维护的启停状态。
 */
export async function syncFinanceCountries(
    connection: Connection,
    database: string,
    apply: boolean,
    countries = FINANCE_COUNTRY_DATA
): Promise<number> {
    if (!(await tableExists(connection, database, 'tb_finance_country'))) {
        throw new Error('国家/地区写入目标表不存在：tb_finance_country')
    }
    if (!(await tableExists(connection, database, 'tb_finance_basic_sms_rate'))) {
        throw new Error('国家/地区关联表不存在：tb_finance_basic_sms_rate')
    }
    if (!apply) return countries.length

    const sql = `INSERT INTO \`tb_finance_country\` (\`code\`, \`mcc\`, \`cn_name\`, \`en_name\`, \`status\`)
        VALUES (?, ?, ?, ?, 'enable')
        ON DUPLICATE KEY UPDATE
            \`cn_name\` = VALUES(\`cn_name\`),
            \`en_name\` = VALUES(\`en_name\`)`
    await connection.beginTransaction()
    try {
        const countryConflicts = await prefixedCodeConflictCount(connection, 'tb_finance_country')
        const smsRateConflicts = await prefixedCodeConflictCount(connection, 'tb_finance_basic_sms_rate')
        if (countryConflicts > 0 || smsRateConflicts > 0) {
            throw new Error(`国家区号格式转换存在重复记录：country=${countryConflicts}, smsRate=${smsRateConflicts}`)
        }
        await connection.execute(`UPDATE \`tb_finance_country\`
            SET \`code\` = TRIM(LEADING '+' FROM \`code\`)
            WHERE \`code\` LIKE '+%'`)
        await connection.execute(`UPDATE \`tb_finance_basic_sms_rate\`
            SET \`code\` = TRIM(LEADING '+' FROM \`code\`)
            WHERE \`code\` LIKE '+%'`)
        for (const item of countries) await connection.execute<ResultSetHeader>(sql, [item.code, item.mcc, item.cnName, item.enName])
        await connection.commit()
        return countries.length
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
    const syncCountries = shouldSyncFinanceCountries(argumentsList)
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
        if (syncCountries) {
            const count = await syncFinanceCountries(connection, database, apply)
            process.stdout.write(
                `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: 'tb_finance_country', database, count }, null, 2)}\n`
            )
        } else if (syncCurrencies) {
            const count = await syncFinanceCurrencies(connection, database, apply)
            process.stdout.write(
                `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: 'tb_finance_currency', database, count }, null, 2)}\n`
            )
        } else {
            throw new Error('必须指定 --sync-countries 或 --sync-currencies')
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
