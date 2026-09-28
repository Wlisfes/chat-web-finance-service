const test = require('node:test')
const assert = require('node:assert/strict')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { BatchFrozenSmsDto } = require('../dist/modules/frozen/sms/dto/sms.dto')
const { FrozenSmsService } = require('../dist/modules/frozen/sms/sms.service')

function fakeTransactionalRepository() {
    const state = { transactions: 0, creates: [], merges: [], saves: [] }
    const manager = {
        create(entity, values) {
            state.creates.push({ entity, values })
            return { ...values }
        },
        merge(entity, target, values) {
            state.merges.push({ entity, target, values })
            Object.assign(target, values)
            return target
        },
        async save(entity) {
            state.saves.push(entity)
            return entity
        }
    }
    const repository = {
        state,
        manager: {
            async transaction(callback) {
                state.transactions += 1
                return callback(manager)
            }
        }
    }
    return { manager, repository }
}

test('CRM 聚合接口使用国家数组查询短信价格 DTO', async () => {
    const batch = plainToInstance(BatchFrozenSmsDto, { countryKeyIds: [1, 2, 2] })
    assert.deepEqual(await validate(batch), [])
    assert.ok((await validate(plainToInstance(BatchFrozenSmsDto, { countryKeyIds: 1 }))).length > 0)
})

test('短信价格新增和编辑在事务内完成组合唯一性校验与写入', async () => {
    const { manager, repository } = fakeTransactionalRepository()
    const calls = []
    const existingRate = { keyId: 18, code: '86', mcc: '460', upUsd: 0.02, downUsd: 0.01, createBy: '10001', modifyBy: '10001' }
    const frozenSmsUtilsService = {
        async findAvailable(code, mcc, transactionManager, excludedKeyId) {
            calls.push({ method: 'findAvailable', code, mcc, transactionManager, excludedKeyId })
        },
        async findRequired(keyId, transactionManager) {
            calls.push({ method: 'findRequired', keyId, transactionManager })
            return existingRate
        }
    }
    const service = new FrozenSmsService(repository, {}, frozenSmsUtilsService, {}, {})

    const createBody = { code: '1', mcc: '310', upUsd: 0.03, downUsd: 0.02, remark: '北美价格' }
    const created = await service.httpBaseFinanceCreateFrozenSms({ uid: '20001' }, createBody)

    assert.equal(repository.state.transactions, 1)
    assert.deepEqual(calls[0], {
        method: 'findAvailable',
        code: '1',
        mcc: '310',
        transactionManager: manager,
        excludedKeyId: undefined
    })
    assert.deepEqual(repository.state.creates[0].values, {
        ...createBody,
        createBy: '20001',
        modifyBy: '20001'
    })
    assert.equal(repository.state.saves[0], created)

    const updateBody = { keyId: 18, code: '852', mcc: '454', upUsd: 0.04, downUsd: 0.03, remark: '香港价格' }
    const updated = await service.httpBaseFinanceUpdateFrozenSms({ uid: '30001' }, updateBody)

    assert.equal(repository.state.transactions, 2)
    assert.deepEqual(calls[1], { method: 'findRequired', keyId: 18, transactionManager: manager })
    assert.deepEqual(calls[2], {
        method: 'findAvailable',
        code: '852',
        mcc: '454',
        transactionManager: manager,
        excludedKeyId: 18
    })
    assert.deepEqual(repository.state.merges[0].values, { ...updateBody, modifyBy: '30001' })
    assert.equal(repository.state.saves[1], existingRate)
    assert.equal(updated, existingRate)
    assert.equal(updated.createBy, '10001')
    assert.equal(updated.modifyBy, '30001')
})

test('短信基础价格分页通过 Feign 补全创建人和修改人', async () => {
    const items = [
        { keyId: 1000, code: '86', mcc: '460', createBy: '0', modifyBy: '1001' },
        { keyId: 1001, code: '1', mcc: '310', createBy: '1001', modifyBy: null }
    ]
    const qb = {
        andWhere() {
            return qb
        },
        orderBy() {
            return qb
        },
        skip() {
            return qb
        },
        take() {
            return qb
        },
        async getManyAndCount() {
            return [items, 2]
        }
    }
    const calls = []
    const database = { builder: (repository, callback) => callback(qb) }
    const frozenSmsUtilsService = {
        async findCountriesByCodes() {
            return [{ keyId: 1, code: '86', cnName: '中国' }]
        }
    }
    const accountFeignClient = {
        async httpBaseAccountColumnUserResolver(authorization, body) {
            calls.push({ authorization, body })
            return [{ uid: '1001', number: '1001', name: '张三' }]
        }
    }
    const configService = { get: () => 'service-token' }
    const service = new FrozenSmsService({}, database, frozenSmsUtilsService, accountFeignClient, configService)

    const result = await service.httpBaseFinanceColumnFrozenSms({ page: 1, size: 10 })
    assert.equal(result.total, 2)
    assert.deepEqual(calls, [{ authorization: 'Bearer service-token', body: { uids: ['1001'] } }])
    assert.deepEqual(result.list[0].countryOptions, { keyId: 1, code: '86', cnName: '中国' })
    assert.deepEqual(result.list[0].createByOptions, { uid: '0', name: '系统' })
    assert.deepEqual(result.list[0].modifyByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.deepEqual(result.list[1].createByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.equal(result.list[1].modifyByOptions, undefined)
})
