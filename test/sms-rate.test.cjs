const test = require('node:test')
const assert = require('node:assert/strict')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { BatchSmsRateDto } = require('../dist/modules/sms-rate/dto/sms-rate.dto')
const { SmsRateService } = require('../dist/modules/sms-rate/sms-rate.service')

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
    const batch = plainToInstance(BatchSmsRateDto, { countryKeyIds: [1, 2, 2] })
    assert.deepEqual(await validate(batch), [])
    assert.ok((await validate(plainToInstance(BatchSmsRateDto, { countryKeyIds: 1 }))).length > 0)
})

test('短信价格新增和编辑在事务内完成组合唯一性校验与写入', async () => {
    const { manager, repository } = fakeTransactionalRepository()
    const calls = []
    const existingRate = { keyId: 18, code: '86', mcc: '460', upUsd: 0.02, downUsd: 0.01, createBy: '10001', modifyBy: '10001' }
    const smsRateUtilsService = {
        async findAvailable(code, mcc, transactionManager, excludedKeyId) {
            calls.push({ method: 'findAvailable', code, mcc, transactionManager, excludedKeyId })
        },
        async findRequired(keyId, transactionManager) {
            calls.push({ method: 'findRequired', keyId, transactionManager })
            return existingRate
        }
    }
    const service = new SmsRateService(repository, {}, smsRateUtilsService)

    const createBody = { code: '1', mcc: '310', upUsd: 0.03, downUsd: 0.02, remark: '北美价格' }
    const created = await service.httpBaseFinanceCreateSmsRate({ uid: '20001' }, createBody)

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
    const updated = await service.httpBaseFinanceUpdateSmsRate({ uid: '30001' }, updateBody)

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
