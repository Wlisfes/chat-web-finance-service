const test = require('node:test')
const assert = require('node:assert/strict')
const { FINANCE_COMMON_CURRENCIES, shouldSyncFinanceCurrencies, syncFinanceCurrencies } = require('../dist/cli/finance-master-data')

function fakeMasterDataConnection(nonEmptyTable) {
    const state = { inserts: [], committed: false, rolledBack: false, transactionStarted: false }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) return [[{ count: 1 }]]
            if (sql.startsWith('INSERT INTO')) {
                state.inserts.push({ sql, parameters })
                return [{ affectedRows: 1 }]
            }
            throw new Error(`Unexpected execute: ${sql}`)
        },
        async query(sql) {
            if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: nonEmptyTable && sql.includes(`\`${nonEmptyTable}\``) ? 1 : 0 }]]
            throw new Error(`Unexpected query: ${sql}`)
        },
        async beginTransaction() {
            state.transactionStarted = true
        },
        async commit() {
            state.committed = true
        },
        async rollback() {
            state.rolledBack = true
        }
    }
}

test('Finance 常用币种集合保持完整', () => {
    assert.equal(FINANCE_COMMON_CURRENCIES.length, 28)
    assert.deepEqual(
        FINANCE_COMMON_CURRENCIES.map(item => item.currency),
        [
            'USD',
            'EUR',
            'CNY',
            'JPY',
            'GBP',
            'CHF',
            'CAD',
            'AUD',
            'HKD',
            'SGD',
            'NZD',
            'INR',
            'BRL',
            'RUB',
            'KRW',
            'MXN',
            'ZAR',
            'AED',
            'SAR',
            'THB',
            'IDR',
            'MYR',
            'VND',
            'PHP',
            'PLN',
            'NOK',
            'SEK',
            'DKK'
        ]
    )
})

test('Finance 常用币种同步默认只预览，显式 --apply 才写入', async () => {
    assert.equal(shouldSyncFinanceCurrencies(['--sync-currencies']), true)
    assert.equal(shouldSyncFinanceCurrencies([]), false)

    const dryRunConnection = fakeMasterDataConnection()
    const dryRunCount = await syncFinanceCurrencies(dryRunConnection, 'chat_web_finance', false)
    assert.equal(dryRunCount, 28)
    assert.equal(dryRunConnection.state.transactionStarted, false)
    assert.equal(dryRunConnection.state.inserts.length, 0)

    const applyConnection = fakeMasterDataConnection()
    const applyCount = await syncFinanceCurrencies(applyConnection, 'chat_web_finance', true)
    assert.equal(applyCount, 28)
    assert.equal(applyConnection.state.transactionStarted, true)
    assert.equal(applyConnection.state.inserts.length, 28)
    assert.equal(applyConnection.state.committed, true)
    assert.equal(applyConnection.state.rolledBack, false)
})
