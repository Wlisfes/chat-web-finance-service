const test = require('node:test')
const assert = require('node:assert/strict')
const { SrmUserAccountService } = require('../dist/modules/srm-user/srm-user.account.service')

/** 内存版 Finance 库：只实现落账用到的查询，余额更新按 SQL 表达式求值，模拟原子增减。 */
function fakeDatabase() {
    const accounts = []
    const bills = []
    const repo = entity => {
        const rows = entity.name === 'TbFinanceSrmUser' ? accounts : bills
        return {
            exists: async ({ where }) => where.some(cond => rows.some(row => Object.entries(cond).every(([k, v]) => row[k] === v))),
            findOneOrFail: async ({ where }) => {
                const row = rows.find(item => item.userKeyId === where.userKeyId)
                if (!row) throw new Error('not found')
                return row
            },
            find: async ({ where }) => rows.filter(row => where.userKeyId._value.includes(row.userKeyId)),
            insert: async values => {
                if (rows.some(row => row.eventId === values.eventId || row.msgId === values.msgId)) throw new Error('ER_DUP_ENTRY')
                rows.push({ ...values })
            }
        }
    }
    const manager = {
        getRepository: repo,
        createQueryBuilder: () => {
            const state = {}
            const builder = {
                insert: () => builder,
                into: () => builder,
                values: values => ((state.values = values), builder),
                orIgnore: () => builder,
                updateEntity: () => builder,
                update: () => ((state.update = true), builder),
                set: values => ((state.set = values), builder),
                where: (_sql, params) => ((state.where = params), builder),
                execute: async () => {
                    if (state.update) {
                        const account = accounts.find(item => item.userKeyId === state.where.userKeyId)
                        for (const [key, value] of Object.entries(state.set)) {
                            if (typeof value !== 'function') account[key] = value
                            else {
                                const [, op, amount] = value().match(/ ([+-]) (\d+)$/)
                                const field = { balance_usd: 'balanceUsd', billed_usd: 'billedUsd', bill_count: 'billCount' }[
                                    value().split(' ')[0]
                                ]
                                account[field] += op === '+' ? Number(amount) : -Number(amount)
                            }
                        }
                        return { affected: account ? 1 : 0 }
                    }
                    if (!accounts.some(item => item.userKeyId === state.values.userKeyId)) accounts.push({ ...state.values })
                    return {}
                }
            }
            return builder
        }
    }
    return { accounts, bills, dataSource: { transaction: async work => work(manager), getRepository: repo } }
}

function event(overrides = {}) {
    return {
        eventId: 'm1:submitted',
        msgId: 'm1',
        msgKeyId: 99,
        userKeyId: 4001,
        simbankKeyId: 3001,
        portKeyId: 2001,
        payMode: 'prepaid',
        trigger: 'submitted',
        segments: 2,
        costUsd: 108200,
        occurredTime: '2026-10-28T02:00:00.000Z',
        ...overrides
    }
}

test('首次计费自动创建账户，扣减余额并写入流水', async () => {
    const db = fakeDatabase()
    const result = await new SrmUserAccountService(db.dataSource).apply(event())
    assert.equal(result, 'applied')
    assert.deepEqual({ ...db.accounts[0] }, { userKeyId: 4001, payMode: 'prepaid', balanceUsd: -108200, billedUsd: 108200, billCount: 1 })
    assert.equal(db.bills.length, 1)
    assert.equal(db.bills[0].balanceUsd, -108200)
    assert.equal(db.bills[0].occurredTime.toISOString(), '2026-10-28T02:00:00.000Z')
})

test('同一事件或同一短信重复投递只计费一次', async () => {
    const db = fakeDatabase()
    const service = new SrmUserAccountService(db.dataSource)
    assert.equal(await service.apply(event()), 'applied')
    assert.equal(await service.apply(event()), 'duplicate')
    assert.equal(await service.apply(event({ eventId: 'm1:success', trigger: 'success', payMode: 'postpaid' })), 'duplicate')
    assert.equal(db.accounts[0].balanceUsd, -108200)
    assert.equal(db.bills.length, 1)
})

test('多条短信累加到同一账户，后付余额为负表示应付', async () => {
    const db = fakeDatabase()
    const service = new SrmUserAccountService(db.dataSource)
    await service.apply(event({ eventId: 'a:success', msgId: 'a', payMode: 'postpaid', trigger: 'success', costUsd: 1000 }))
    await service.apply(event({ eventId: 'b:success', msgId: 'b', payMode: 'postpaid', trigger: 'success', costUsd: 2500 }))
    assert.equal(db.accounts.length, 1)
    assert.equal(db.accounts[0].balanceUsd, -3500)
    assert.equal(db.accounts[0].billCount, 2)
    assert.equal(db.bills[1].balanceUsd, -3500)
})

test('不完整的计费事件不落账', async () => {
    const db = fakeDatabase()
    const service = new SrmUserAccountService(db.dataSource)
    for (const bad of [undefined, event({ msgId: '' }), event({ payMode: 'other' }), event({ costUsd: -1 }), event({ costUsd: 1.5 })]) {
        assert.equal(await service.apply(bad), 'invalid')
    }
    assert.equal(db.accounts.length, 0)
})

test('余额查询：没有账户的供应商返回 0，超过 100 个拒绝', async () => {
    const db = fakeDatabase()
    const service = new SrmUserAccountService(db.dataSource)
    await service.apply(event())
    assert.deepEqual(await service.findColumnResolver([4001, 4002, 4001]), [
        { userKeyId: 4001, balanceUsd: -108200, billedUsd: 108200, billCount: 1 },
        { userKeyId: 4002, balanceUsd: 0, billedUsd: 0, billCount: 0 }
    ])
    await assert.rejects(() => service.findColumnResolver(Array.from({ length: 101 }, (_, i) => i + 1)), /100/)
})
