const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { RATE_DATE_RENAME_MIGRATION, ensureCurrencyExchangeDateColumn } = require('../dist/cli/apply-schema')

function fakeRateDateMigrationConnection(columns) {
    const state = { altered: false }
    return {
        state,
        async query(sql) {
            if (sql.includes('information_schema.columns')) {
                return [columns.map(columnName => ({ columnName }))]
            }
            if (sql.startsWith('ALTER TABLE `tb_finance_currency_exchange`')) {
                state.altered = true
                return []
            }
            throw new Error(`Unexpected query: ${sql}`)
        }
    }
}

const dockerfile = readFileSync(resolve(__dirname, '..', 'Dockerfile'), 'utf8')

test('Dockerfile 应兼容 GitHub Packages 两种 Schema tarball 地址', () => {
    assert.match(dockerfile, /https:\/\/npm\.pkg\.github\.com\/@wlisfes\/chat-web-base-schema\/-\/chat-web-base-schema-\[\^\\" \]\*/)
    assert.match(dockerfile, /https:\/\/npm\.pkg\.github\.com\/download\/@wlisfes\/chat-web-base-schema\/\[\^\\" \]\*/)
    assert.match(dockerfile, /grep -Fq "\$schema_tarball" yarn\.lock/)
})

test('汇率日期重命名迁移兼容完整建表 SQL 已创建 date 列的数据库', async () => {
    assert.equal(RATE_DATE_RENAME_MIGRATION, '20260902090000__tb_finance_currency_exchange__rename_rate_date_to_date.sql')

    const legacy = fakeRateDateMigrationConnection(['rate_date'])
    assert.equal(await ensureCurrencyExchangeDateColumn(legacy), true)
    assert.equal(legacy.state.altered, true)

    const alreadyMigrated = fakeRateDateMigrationConnection(['date'])
    assert.equal(await ensureCurrencyExchangeDateColumn(alreadyMigrated), false)
    assert.equal(alreadyMigrated.state.altered, false)

    const inconsistent = fakeRateDateMigrationConnection(['rate_date', 'date'])
    await assert.rejects(() => ensureCurrencyExchangeDateColumn(inconsistent), /同时存在 rate_date 和 date 字段/)
})
