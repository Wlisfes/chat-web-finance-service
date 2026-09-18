const test = require('node:test')
const assert = require('node:assert/strict')
const { FINANCE_COUNTRY_DATA } = require('../dist/cli/finance-country-data')
const {
    FINANCE_COMMON_CURRENCIES,
    shouldSyncFinanceCountries,
    shouldSyncFinanceCurrencies,
    syncFinanceCountries,
    syncFinanceCurrencies
} = require('../dist/cli/finance-master-data')

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

function fakeCountrySyncConnection(initialRows = []) {
    const state = {
        rows: new Map(initialRows.map(row => [`${row.code}:${row.mcc}`, { ...row }])),
        inserts: [],
        transactions: 0,
        commits: 0,
        rollbacks: 0
    }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) return [[{ count: 1 }]]
            if (sql.startsWith('SELECT COUNT(*) count')) {
                const count = [...state.rows.values()].filter(
                    row => row.code.startsWith('+') && state.rows.has(`${row.code.slice(1)}:${row.mcc}`)
                ).length
                return [[{ count }]]
            }
            if (sql.startsWith('UPDATE `tb_finance_country`')) {
                for (const [key, row] of [...state.rows]) {
                    if (!row.code.startsWith('+')) continue
                    state.rows.delete(key)
                    const normalized = { ...row, code: row.code.slice(1) }
                    state.rows.set(`${normalized.code}:${normalized.mcc}`, normalized)
                }
                return [{ affectedRows: 0 }]
            }
            if (sql.startsWith('UPDATE `tb_finance_basic_sms_rate`')) return [{ affectedRows: 0 }]
            if (!sql.startsWith('INSERT INTO')) throw new Error(`Unexpected execute: ${sql}`)

            const [code, mcc, cnName, enName] = parameters
            const key = `${code}:${mcc}`
            const existing = state.rows.get(key)
            const updatesStatus = /`status`\s*=\s*VALUES\(`status`\)/i.test(sql)
            state.inserts.push({ sql, parameters })
            state.rows.set(key, {
                ...existing,
                code,
                mcc,
                cnName,
                enName,
                status: existing && !updatesStatus ? existing.status : 'enable'
            })
            return [{ affectedRows: existing ? 2 : 1 }]
        },
        async beginTransaction() {
            state.transactions += 1
        },
        async commit() {
            state.commits += 1
        },
        async rollback() {
            state.rollbacks += 1
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

test('Finance 国家地区主数据包含 137 条合法且唯一的区号 MCC 组合', () => {
    assert.equal(FINANCE_COUNTRY_DATA.length, 137)
    const uniqueKeys = new Set()
    for (const item of FINANCE_COUNTRY_DATA) {
        assert.match(item.code, /^\d{1,3}$/, `${item.cnName} 的国际区号格式错误`)
        assert.match(item.mcc, /^\d{3}$/, `${item.cnName} 的 MCC 格式错误`)
        uniqueKeys.add(`${item.code}:${item.mcc}`)
    }
    assert.equal(uniqueKeys.size, FINANCE_COUNTRY_DATA.length)
})

test('Finance 国家地区同步默认只预览，显式 --apply 才写入', async () => {
    assert.equal(shouldSyncFinanceCountries(['--sync-countries']), true)
    assert.equal(shouldSyncFinanceCountries([]), false)

    const dryRunConnection = fakeCountrySyncConnection()
    const dryRunCount = await syncFinanceCountries(dryRunConnection, 'chat_web_finance', false)
    assert.equal(dryRunCount, 137)
    assert.equal(dryRunConnection.state.transactions, 0)
    assert.equal(dryRunConnection.state.inserts.length, 0)
    assert.equal(dryRunConnection.state.rows.size, 0)

    const applyConnection = fakeCountrySyncConnection()
    const applyCount = await syncFinanceCountries(applyConnection, 'chat_web_finance', true)
    assert.equal(applyCount, 137)
    assert.equal(applyConnection.state.transactions, 1)
    assert.equal(applyConnection.state.inserts.length, 137)
    assert.equal(applyConnection.state.rows.size, 137)
    assert.equal(applyConnection.state.commits, 1)
    assert.equal(applyConnection.state.rollbacks, 0)
})

test('Finance 国家地区同步保持幂等且不覆盖人工禁用状态', async () => {
    const disabledCountry = { ...FINANCE_COUNTRY_DATA[0], keyId: 1000, code: `+${FINANCE_COUNTRY_DATA[0].code}`, status: 'disable' }
    const connection = fakeCountrySyncConnection([disabledCountry])

    await syncFinanceCountries(connection, 'chat_web_finance', true)
    await syncFinanceCountries(connection, 'chat_web_finance', true)

    assert.equal(connection.state.rows.size, FINANCE_COUNTRY_DATA.length)
    assert.equal(connection.state.rows.has(`${disabledCountry.code}:${disabledCountry.mcc}`), false)
    assert.equal(connection.state.rows.get(`${FINANCE_COUNTRY_DATA[0].code}:${disabledCountry.mcc}`).status, 'disable')
    assert.equal(connection.state.rows.get(`${FINANCE_COUNTRY_DATA[0].code}:${disabledCountry.mcc}`).keyId, 1000)
    assert.equal(connection.state.transactions, 2)
    assert.equal(connection.state.commits, 2)
    assert.equal(connection.state.rollbacks, 0)
})

test('Finance 国家区号转换发现新旧格式冲突时回滚', async () => {
    const country = FINANCE_COUNTRY_DATA[0]
    const connection = fakeCountrySyncConnection([
        { ...country, keyId: 1000, code: `+${country.code}`, status: 'disable' },
        { ...country, keyId: 2000, status: 'enable' }
    ])

    await assert.rejects(() => syncFinanceCountries(connection, 'chat_web_finance', true), /国家区号格式转换存在重复记录/)

    assert.equal(connection.state.rows.size, 2)
    assert.equal(connection.state.commits, 0)
    assert.equal(connection.state.rollbacks, 1)
})
