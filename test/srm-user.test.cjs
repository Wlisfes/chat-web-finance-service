const test = require('node:test')
const assert = require('node:assert/strict')
const { SrmUserService } = require('../dist/modules/srm/user/user.service')

function redis(writes = []) {
    return {
        async hMSet(key, fields) {
            writes.push({ key, fields })
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
        find: async ({ where }) => accounts.filter(row => where.userKeyId._value.includes(row.userKeyId))
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
                    if (!accounts.some(item => item.userKeyId === state.values.userKeyId)) accounts.push({ ...state.values })
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
        fields: { currency: 'USD', payMode: 'prepaid', balance: 0, credit: 100 }
    })
    db.accounts[0].balance = 20
    const again = await service.create({ userKeyId: 4001, currency: 'EUR', payMode: 'postpaid' })
    assert.equal(again.balance, 20)
    assert.equal(again.currency, 'USD')
    assert.equal(db.accounts.length, 1)
})

test('钱包查询：没有钱包的供应商币种为 null、金额为 0，超过 100 个拒绝', async () => {
    const db = fakeDatabase()
    const service = new SrmUserService(db.dataSource, redis())
    await service.create({ userKeyId: 4001, currency: 'USD', payMode: 'prepaid' })
    assert.deepEqual(await service.findColumnResolver([4001, 4002, 4001]), [
        { userKeyId: 4001, currency: 'USD', balance: 0, credit: 0 },
        { userKeyId: 4002, currency: null, balance: 0, credit: 0 }
    ])
    await assert.rejects(() => service.findColumnResolver(Array.from({ length: 101 }, (_, index) => index + 1)), /100/)
})
