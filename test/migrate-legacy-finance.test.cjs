const test = require('node:test')
const assert = require('node:assert/strict')
const { TABLE_MIGRATIONS, buildInsertSelectSql, migrateLegacyTables, shouldApplyMigration } = require('../dist/cli/migrate-legacy-finance')

function fakeMigrationConnection() {
    const sourceTables = new Set(['tb_windows_brand'])
    const targetTables = new Set(['tb_finance_brand'])
    const state = { inserts: [], committed: false, rolledBack: false }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) {
                const [database, table] = parameters
                const exists = database === 'legacy_windows' ? sourceTables.has(table) : targetTables.has(table)
                return [[{ count: exists ? 1 : 0 }]]
            }
            throw new Error(`Unexpected execute: ${sql}`)
        },
        async query(sql) {
            if (sql.startsWith('SELECT COUNT(*)')) {
                const source = sql.includes('`legacy_windows`')
                return [[{ count: source ? 2 : 0 }]]
            }
            if (sql.startsWith('INSERT INTO')) {
                state.inserts.push(sql)
                return [{ affectedRows: 2 }]
            }
            throw new Error(`Unexpected query: ${sql}`)
        },
        async beginTransaction() {},
        async commit() {
            state.committed = true
        },
        async rollback() {
            state.rolledBack = true
        }
    }
}

test('旧数据迁移默认 dry-run，且只迁移 Finance 所属表', async () => {
    assert.equal(shouldApplyMigration([]), false)
    assert.equal(shouldApplyMigration(['--apply']), true)

    const connection = fakeMigrationConnection()
    const counts = await migrateLegacyTables(connection, 'legacy_windows', 'chat_web_finance', false)
    assert.equal(connection.state.committed, false)
    assert.equal(connection.state.rolledBack, true)
    assert.deepEqual(counts, { tb_finance_brand: 2 })
    assert.equal(connection.state.inserts.length, 1)
    assert.equal(
        TABLE_MIGRATIONS.some(item => item.source.startsWith('tb_windows_client')),
        false
    )
})

test('显式 --apply 才提交旧数据迁移', async () => {
    const connection = fakeMigrationConnection()
    await migrateLegacyTables(connection, 'legacy_windows', 'chat_web_finance', true)
    assert.equal(connection.state.committed, true)
    assert.equal(connection.state.rolledBack, false)
})

test('迁移 SQL 保留旧自增主键并映射汇率日期', () => {
    const exchange = TABLE_MIGRATIONS.find(item => item.source === 'tb_windows_currency_exchange')
    const sql = buildInsertSelectSql(exchange, 'legacy_windows', 'chat_web_finance')
    assert.match(sql, /^INSERT INTO `chat_web_finance`.`tb_finance_currency_exchange` \(`key_id`/)
    assert.match(sql, /`date`.*SELECT.*`date`/)
})
