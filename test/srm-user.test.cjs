const test = require('node:test')
const assert = require('node:assert/strict')
const { SrmUserService } = require('../dist/modules/srm/user/user.service')

function redis(writes = [], snapshots = new Map()) {
    return {
        async hMSet(key, fields) {
            writes.push({ key, fields })
            snapshots.set(key, Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, String(value)])))
        },
        async hGetAll(key) {
            return { ...(snapshots.get(key) ?? {}) }
        }
    }
}

function fakeDatabase() {
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
    return { accounts, dataSource: { transaction: async work => work(manager), getRepository: repo } }
}

test('创建钱包写入 Redis，重复创建不重置余额', async () => {
    const db = fakeDatabase()
    const writes = []
    const service = new SrmUserService(db.dataSource, redis(writes))
    const created = await service.create({ userKeyId: 4001, currency: 'USD', payMode: 'prepaid', credit: 100 })
    assert.equal(created.balance, 0)
    assert.equal(created.credit, 100)
    assert.deepEqual(writes[0], {
        key: 'chat-web-finance:srm:wallet:4001',
        fields: { balance: 0, credit: 100 }
    })
    db.accounts[0].balance = 20
    const again = await service.create({ userKeyId: 4001, currency: 'EUR', payMode: 'postpaid' })
    assert.equal(again.balance, 20)
    assert.equal(again.currency, 'USD')
    assert.equal(db.accounts.length, 1)
})

test('钱包查询：只返回 Redis 最新余额和信用额度，没有钱包时金额为 0，超过 100 个拒绝', async () => {
    const db = fakeDatabase()
    const snapshots = new Map()
    const service = new SrmUserService(db.dataSource, redis([], snapshots))
    await service.create({ userKeyId: 4001, currency: 'USD', payMode: 'prepaid', credit: 100 })
    db.accounts[0].balance = 20
    db.accounts[0].credit = 200
    snapshots.set('chat-web-finance:srm:wallet:4001', {
        balance: '-1250000',
        credit: '300000000'
    })
    assert.deepEqual(await service.findColumnResolver([4001, 4002, 4001]), [
        { userKeyId: 4001, balance: -1250000, credit: 300000000 },
        { userKeyId: 4002, balance: 0, credit: 0 }
    ])
    await assert.rejects(() => service.findColumnResolver(Array.from({ length: 101 }, (_, index) => index + 1)), /100/)
})

test('钱包查询：Redis 金额格式错误时拒绝返回', async () => {
    const db = fakeDatabase()
    const snapshots = new Map()
    const service = new SrmUserService(db.dataSource, redis([], snapshots))
    await service.create({ userKeyId: 4001, currency: 'USD', payMode: 'prepaid' })
    snapshots.set('chat-web-finance:srm:wallet:4001', { credit: '0' })
    await assert.rejects(() => service.findColumnResolver([4001]), /Redis 余额缺失或格式错误/)
})

test('启动时为现有钱包补齐 Redis 缓存，已有缓存不覆盖最新余额', async () => {
    const db = fakeDatabase()
    db.accounts.push({ keyId: 1, userKeyId: 5001, balance: 100, credit: 10 }, { keyId: 2, userKeyId: 5002, balance: 200, credit: 20 })
    const snapshots = new Map([['chat-web-finance:srm:wallet:5002', { balance: '150', credit: '20' }]])
    const service = new SrmUserService(db.dataSource, redis([], snapshots))
    await service.onApplicationBootstrap()
    assert.deepEqual(snapshots.get('chat-web-finance:srm:wallet:5001'), { balance: '100', credit: '10' })
    assert.deepEqual(snapshots.get('chat-web-finance:srm:wallet:5002'), { balance: '150', credit: '20' })
})
