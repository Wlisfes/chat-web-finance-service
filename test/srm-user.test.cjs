const test = require('node:test')
const assert = require('node:assert/strict')
const { SrmUserService } = require('../dist/modules/srm/user/user.service')

const BALANCE_KEY = 'chat-web-finance:srm:balances'
const CREDIT_KEY = 'chat-web-finance:srm:credits'

function redis(writes = [], hashes = new Map(), keys = new Map()) {
    const hashOf = key => {
        if (!hashes.has(key)) hashes.set(key, {})
        return hashes.get(key)
    }
    return {
        keys,
        async hSet(key, field, value) {
            writes.push({ key, field, value })
            hashOf(key)[field] = String(value)
        },
        async hMSet(key, fields) {
            writes.push({ key, fields })
            Object.assign(hashOf(key), Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, String(value)])))
        },
        async hGet(key, field) {
            return hashes.get(key)?.[field] ?? null
        },
        async hGetAll(key) {
            return { ...(hashes.get(key) ?? {}) }
        },
        async hMGet(key, fields) {
            const hash = hashes.get(key) ?? {}
            return fields.map(field => hash[field] ?? null)
        },
        async set(key, value) {
            keys.set(key, String(value))
        },
        async getDel(key) {
            const value = keys.get(key) ?? null
            keys.delete(key)
            return value
        },
        async scan(pattern) {
            const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
            return [...keys.keys()].filter(key => key.startsWith(prefix))
        }
    }
}

function fakeDatabase({ queryError } = {}) {
    const accounts = []
    const repo = () => ({
        findOneOrFail: async ({ where }) => {
            const row = accounts.find(item => item.userKeyId === where.userKeyId)
            if (!row) throw new Error('not found')
            return row
        },
        find: async ({ where, take }) =>
            accounts
                .filter(row => row.keyId > where.keyId._value)
                .sort((left, right) => left.keyId - right.keyId)
                .slice(0, take)
    })
    const manager = {
        createQueryBuilder: () => {
            const state = {}
            const builder = {
                insert: () => builder,
                into: () => builder,
                values: values => ((state.values = values), builder),
                orIgnore: () => builder,
                updateEntity: () => builder,
                execute: async () => {
                    if (!accounts.some(item => item.userKeyId === state.values.userKeyId))
                        accounts.push({ keyId: accounts.length + 1, ...state.values })
                    return {}
                }
            }
            return builder
        }
    }
    return {
        accounts,
        dataSource: {
            transaction: async work => work(manager),
            getRepository: repo,
            query: async (sql, params) => {
                if (queryError) {
                    const error = queryError
                    queryError = null
                    throw error
                }
                const pairCount = (sql.match(/WHEN \?/g) ?? []).length
                let affectedRows = 0
                for (let index = 0; index < pairCount; index += 1) {
                    const row = accounts.find(item => item.userKeyId === params[index * 2])
                    if (row && row.balance !== params[index * 2 + 1]) {
                        row.balance = params[index * 2 + 1]
                        affectedRows += 1
                    }
                }
                return { affectedRows }
            }
        }
    }
}

test('创建钱包写入总余额哈希，重复创建不重置余额', async () => {
    const db = fakeDatabase()
    const writes = []
    const service = new SrmUserService(db.dataSource, redis(writes))
    const created = await service.create({ userKeyId: 4001, currency: 'USD', payMode: 'prepaid', credit: 100 })
    assert.equal(created.balance, 0)
    assert.equal(created.credit, 100)
    assert.deepEqual(writes, [
        { key: BALANCE_KEY, field: '4001', value: '0' },
        { key: CREDIT_KEY, field: '4001', value: '100' }
    ])
    db.accounts[0].balance = 20
    const again = await service.create({ userKeyId: 4001, currency: 'EUR', payMode: 'postpaid' })
    assert.equal(again.balance, 20)
    assert.equal(again.currency, 'USD')
    assert.equal(db.accounts.length, 1)
    assert.equal(writes.length, 2)
})

test('钱包查询一次读取总哈希，没有钱包时金额为 0', async () => {
    const hashes = new Map([
        [BALANCE_KEY, { 4001: '-1250000' }],
        [CREDIT_KEY, { 4001: '300000000' }]
    ])
    const service = new SrmUserService(fakeDatabase().dataSource, redis([], hashes))
    assert.deepEqual(await service.findColumnResolver([4001, 4002, 4001]), [
        { userKeyId: 4001, balance: -1250000, credit: 300000000 },
        { userKeyId: 4002, balance: 0, credit: 0 }
    ])
    await assert.rejects(() => service.findColumnResolver(Array.from({ length: 101 }, (_, index) => index + 1)), /100/)
})

test('钱包查询：Redis 金额格式错误时拒绝返回', async () => {
    const hashes = new Map([
        [BALANCE_KEY, { 4001: 'bad' }],
        [CREDIT_KEY, { 4001: '0' }]
    ])
    const service = new SrmUserService(fakeDatabase().dataSource, redis([], hashes))
    await assert.rejects(() => service.findColumnResolver([4001]), /Redis 余额缺失或格式错误/)
})

test('启动时只补齐总哈希里没有的钱包，不覆盖已有余额', async () => {
    const db = fakeDatabase()
    db.accounts.push({ keyId: 1, userKeyId: 5001, balance: 100, credit: 10 }, { keyId: 2, userKeyId: 5002, balance: 200, credit: 20 })
    const hashes = new Map([
        [BALANCE_KEY, { 5002: '150' }],
        [CREDIT_KEY, { 5002: '20' }]
    ])
    const service = new SrmUserService(db.dataSource, redis([], hashes))
    await service.onApplicationBootstrap()
    assert.equal(hashes.get(BALANCE_KEY)['5001'], '100')
    assert.equal(hashes.get(BALANCE_KEY)['5002'], '150')
    assert.equal(hashes.get(CREDIT_KEY)['5001'], '10')
})

test('余额同步只处理 dirty 标记账户，并消费已回写标记', async () => {
    const db = fakeDatabase()
    db.accounts.push(
        { keyId: 1, userKeyId: 6001, balance: 100, credit: 0 },
        { keyId: 2, userKeyId: 6002, balance: 200, credit: 0 },
        { keyId: 3, userKeyId: 6003, balance: 300, credit: 0 },
        { keyId: 4, userKeyId: 6004, balance: 400, credit: 0 }
    )
    const hashes = new Map([[BALANCE_KEY, { 6001: '-54100', 6002: '200', 6003: '999', 6004: 'bad' }]])
    const keys = new Map([
        ['chat-web-finance:srm:balance-dirty:6001', '1'],
        ['chat-web-finance:srm:balance-dirty:6002', '1'],
        ['chat-web-finance:srm:balance-dirty:6004', '1']
    ])
    const service = new SrmUserService(db.dataSource, redis([], hashes, keys))
    const result = await service.syncWalletBalance()
    assert.deepEqual(result, { total: 3, updated: 1, unchanged: 1, restored: 0, invalidUserKeyIds: [6004] })
    assert.deepEqual(
        db.accounts.map(item => item.balance),
        [-54100, 200, 300, 400]
    )
    assert.equal(keys.size, 0)
})

test('数据库回写失败时补回 dirty 标记，下一轮可以重试', async () => {
    const db = fakeDatabase({ queryError: new Error('数据库不可用') })
    db.accounts.push({ keyId: 1, userKeyId: 7001, balance: 100, credit: 0 })
    const hashes = new Map([[BALANCE_KEY, { 7001: '90' }]])
    const keys = new Map([['chat-web-finance:srm:balance-dirty:7001', '1']])
    const service = new SrmUserService(db.dataSource, redis([], hashes, keys))

    await assert.rejects(() => service.syncWalletBalance(), /数据库不可用/)
    assert.equal(keys.get('chat-web-finance:srm:balance-dirty:7001'), '1')
    assert.equal(db.accounts[0].balance, 100)
})

test('回写过程中产生的新 dirty 标记不会被本轮消费掉', async () => {
    const db = fakeDatabase()
    db.accounts.push({ keyId: 1, userKeyId: 8001, balance: 100, credit: 0 })
    const hashes = new Map([[BALANCE_KEY, { 8001: '90' }]])
    const dirtyKey = 'chat-web-finance:srm:balance-dirty:8001'
    const keys = new Map([[dirtyKey, '1']])
    const cache = redis([], hashes, keys)
    const readBalances = cache.hMGet
    cache.hMGet = async (...args) => {
        const result = await readBalances(...args)
        keys.set(dirtyKey, '1')
        return result
    }
    const service = new SrmUserService(db.dataSource, cache)

    const result = await service.syncWalletBalance()
    assert.equal(result.updated, 1)
    assert.equal(keys.get(dirtyKey), '1')
})
