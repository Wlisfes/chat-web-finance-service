import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import mysql, { RowDataPacket } from 'mysql2/promise'
import { getDatabaseName, loadFinanceDatabaseConfig, loadLocalEnvironment } from '@/cli/database-config'

type MigrationRow = RowDataPacket & { checksum: string }
type ColumnRow = RowDataPacket & { columnName: string }
const MIGRATION_TABLE = 'tb_finance_schema_migration'
export const RATE_DATE_RENAME_MIGRATION = '20260902090000__tb_finance_currency_exchange__rename_rate_date_to_date.sql'

/** 确保汇率日期列已从旧名称迁移到 date，兼容已由完整建表 SQL 创建新列的数据库。 */
export async function ensureCurrencyExchangeDateColumn(connection: mysql.Connection): Promise<boolean> {
    const [rows] = await connection.query<ColumnRow[]>(
        `SELECT COLUMN_NAME AS columnName
           FROM information_schema.columns
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tb_finance_currency_exchange'
            AND COLUMN_NAME IN ('rate_date', 'date')`
    )
    const hasRateDate = rows.some(row => row.columnName === 'rate_date')
    const hasDate = rows.some(row => row.columnName === 'date')

    if (hasDate && !hasRateDate) return false
    if (hasRateDate && hasDate) {
        throw new Error('汇率表同时存在 rate_date 和 date 字段，请先人工确认数据后再执行 Schema 迁移')
    }
    if (!hasRateDate) {
        throw new Error('汇率表缺少 rate_date 字段，无法执行日期列重命名迁移')
    }

    await connection.query("ALTER TABLE `tb_finance_currency_exchange` CHANGE COLUMN `rate_date` `date` date NOT NULL COMMENT '汇率日期'")
    return true
}

function changesDirectory(): string {
    const schemaEntry = createRequire(__filename).resolve('@wlisfes/chat-web-base-schema/chat-web-finance-mysql')
    return path.join(path.resolve(path.dirname(schemaEntry), '../../../..'), 'src/schema/chat-web-finance-mysql/sql/changes')
}

async function main(): Promise<void> {
    loadLocalEnvironment()
    const config = await loadFinanceDatabaseConfig()
    const database = getDatabaseName(config)
    const connection = await mysql.createConnection({
        host: process.env.FINANCE_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.FINANCE_MYSQL_PORT || config.port || 3306),
        user: process.env.FINANCE_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.FINANCE_MYSQL_PASSWORD ?? config.password,
        database,
        charset: process.env.FINANCE_MYSQL_CHARSET || config.charset || 'utf8mb4',
        multipleStatements: true
    })
    try {
        const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
        assertMysqlDatabaseIsolation(
            grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string')),
            database
        )
        await connection.query(
            `CREATE TABLE IF NOT EXISTS \`${MIGRATION_TABLE}\` (
                \`filename\` varchar(255) NOT NULL,
                \`checksum\` char(64) NOT NULL,
                \`applied_time\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (\`filename\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='财务库Schema增量记录表'`
        )
        const directory = changesDirectory()
        const filenames = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
        for (const filename of filenames) {
            const sql = await readFile(path.join(directory, filename), 'utf8')
            const checksum = createHash('sha256').update(sql).digest('hex')
            const [rows] = await connection.execute<MigrationRow[]>(`SELECT checksum FROM \`${MIGRATION_TABLE}\` WHERE filename = ?`, [
                filename
            ])
            if (rows.length) {
                if (rows[0].checksum !== checksum) throw new Error(`已应用增量 SQL 校验和变化：${filename}`)
                process.stdout.write(`Schema migration skipped: ${filename}\n`)
                continue
            }
            let applied = true
            if (filename === RATE_DATE_RENAME_MIGRATION) applied = await ensureCurrencyExchangeDateColumn(connection)
            else await connection.query(sql)
            await connection.execute(`INSERT INTO \`${MIGRATION_TABLE}\` (filename, checksum) VALUES (?, ?)`, [filename, checksum])
            process.stdout.write(`Schema migration ${applied ? 'applied' : 'skipped (date 列已存在)'}: ${filename}\n`)
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
