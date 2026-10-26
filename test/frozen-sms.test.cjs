const test = require('node:test')
const assert = require('node:assert/strict')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { FrozenSmsService } = require('../dist/modules/frozen/sms/sms.service')
const { FrozenSmsUtilsService } = require('../dist/modules/frozen/sms/sms.utils.service')

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

test('短信价格 Feign 批量查询去重、忽略未配置价格，单条查询不存在时抛出 404', async () => {
    const queries = []
    const database = {
        async builder(_repository, callback) {
            const qb = {
                select() {
                    return qb
                },
                where(sql, params) {
                    queries.push(params.countryKeyIds)
                    return qb
                },
                async getMany() {
                    return [{ countryKeyId: 1, upUsd: 20000, downUsd: 10000 }]
                }
            }
            return callback(qb)
        }
    }
    const service = Object.assign(new FrozenSmsUtilsService({}, database, {}, {}), {
        async findCountriesByKeyIds() {
            return [
                { keyId: 1, code: '86', mcc: '460', cnName: '中国', enName: 'China' },
                { keyId: 2, code: '1', mcc: '310', cnName: '美国', enName: 'United States' }
            ]
        }
    })
    assert.deepEqual(await service.findColumnResolver([1, 2, 2]), [
        { countryKeyId: 1, code: '86', mcc: '460', cnName: '中国', enName: 'China', upUsd: 20000, downUsd: 10000 }
    ])
    assert.deepEqual(queries[0], [1, 2])
    assert.deepEqual(await service.findColumnResolver([]), [])
    await assert.rejects(() => service.findColumnResolver(Array.from({ length: 101 }, (_, index) => index + 1)), /100/)
    await assert.rejects(
        () => Object.assign(service, { findColumnResolver: async () => [] }).findResolver(3),
        error => error.status === 404
    )
})

test('短信价格新增和编辑在事务内完成组合唯一性校验与写入', async () => {
    const { manager, repository } = fakeTransactionalRepository()
    const calls = []
    const existingRate = { keyId: 18, code: '86', mcc: '460', upUsd: 20000, downUsd: 10000, createBy: '10001', modifyBy: '10001' }
    const frozenSmsUtilsService = Object.assign(new FrozenSmsUtilsService({}, {}, {}, {}), {
        async findCountriesRequired(countryKeyIds) {
            calls.push({ method: 'findCountriesRequired', countryKeyIds })
            return countryKeyIds[0] === 1001 ? [{ keyId: 1001, code: '1', mcc: '310' }] : [{ keyId: 1002, code: '852', mcc: '454' }]
        },
        async findAvailable(countryKeyId, transactionManager, excludedKeyId) {
            calls.push({ method: 'findAvailable', countryKeyId, transactionManager, excludedKeyId })
        },
        async findRequired(keyId, transactionManager) {
            calls.push({ method: 'findRequired', keyId, transactionManager })
            return existingRate
        }
    })
    const service = new FrozenSmsService(repository, {}, frozenSmsUtilsService, {}, {})

    const createBody = { countryKeyId: 1001, upUsd: 0.03, downUsd: 0.02, remark: '北美价格' }
    const created = await service.httpBaseFinanceCreateFrozenSms({ uid: '20001' }, createBody)

    assert.equal(repository.state.transactions, 1)
    assert.deepEqual(calls[0], { method: 'findCountriesRequired', countryKeyIds: [1001] })
    assert.deepEqual(calls[1], { method: 'findAvailable', countryKeyId: 1001, transactionManager: manager, excludedKeyId: undefined })
    // 接口收发美元价格，入库前放大百万倍存储，返回时再换算回美元。
    assert.deepEqual(repository.state.creates[0].values, {
        ...createBody,
        upUsd: 30000,
        downUsd: 20000,
        code: '1',
        mcc: '310',
        createBy: '20001',
        modifyBy: '20001'
    })
    assert.deepEqual([created.upUsd, created.downUsd], [0.03, 0.02])

    const updateBody = { keyId: 18, countryKeyId: 1002, upUsd: 0.04, downUsd: 0.03, remark: '香港价格' }
    const updated = await service.httpBaseFinanceUpdateFrozenSms({ uid: '30001' }, updateBody)

    assert.equal(repository.state.transactions, 2)
    assert.deepEqual(calls[2], { method: 'findRequired', keyId: 18, transactionManager: manager })
    assert.deepEqual(calls[3], { method: 'findCountriesRequired', countryKeyIds: [1002] })
    assert.deepEqual(calls[4], { method: 'findAvailable', countryKeyId: 1002, transactionManager: manager, excludedKeyId: 18 })
    assert.deepEqual(repository.state.merges[0].values, {
        ...updateBody,
        upUsd: 40000,
        downUsd: 30000,
        code: '852',
        mcc: '454',
        modifyBy: '30001'
    })
    assert.equal(repository.state.saves[1], existingRate)
    assert.deepEqual([existingRate.upUsd, existingRate.downUsd], [40000, 30000])
    assert.deepEqual([updated.upUsd, updated.downUsd], [0.04, 0.03])
    assert.equal(updated.createBy, '10001')
    assert.equal(updated.modifyBy, '30001')
})

test('短信基础价格分页通过 Feign 补全创建人和修改人', async () => {
    const items = [
        { keyId: 1000, countryKeyId: 1, code: '86', mcc: '460', upUsd: 7500, downUsd: 108200, createBy: '0', modifyBy: '1001' },
        { keyId: 1001, countryKeyId: 2, code: '1', mcc: '310', upUsd: 7600, downUsd: 87510, createBy: '1001', modifyBy: null }
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
    const frozenSmsUtilsService = Object.assign(new FrozenSmsUtilsService({}, {}, {}, {}), {
        async findCountriesByKeyIds() {
            return [{ keyId: 1, code: '86', mcc: '460', cnName: '中国' }]
        }
    })
    const skylineFeignClient = {
        async httpBaseSkylineColumnUserResolver(authorization, body) {
            calls.push({ authorization, body })
            return [{ uid: '1001', number: '1001', name: '张三' }]
        }
    }
    const configService = { get: () => 'service-token' }
    const service = new FrozenSmsService({}, database, frozenSmsUtilsService, skylineFeignClient, configService)

    const result = await service.httpBaseFinanceColumnFrozenSms({ page: 1, size: 10 })
    assert.equal(result.total, 2)
    assert.deepEqual(
        result.list.map(item => [item.upUsd, item.downUsd]),
        [
            [0.0075, 0.1082],
            [0.0076, 0.08751]
        ]
    )
    assert.deepEqual(calls, [{ authorization: 'Bearer service-token', body: { uids: ['1001'] } }])
    assert.deepEqual(result.list[0].countryOptions, { keyId: 1, code: '86', mcc: '460', cnName: '中国' })
    assert.deepEqual(result.list[0].createByOptions, { uid: '0', name: '系统' })
    assert.deepEqual(result.list[0].modifyByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.deepEqual(result.list[1].createByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.equal(result.list[1].modifyByOptions, undefined)
})

test('批量调价按金额和百分比计算，并在价格小于 0 时整批拒绝', async () => {
    const { repository } = fakeTransactionalRepository()
    let rates = []
    // 使用真实工具服务的校验和计算逻辑，只替换数据库查询。
    const frozenSmsUtilsService = Object.assign(new FrozenSmsUtilsService({}, {}, {}, {}), {
        async findListRequired(countryKeyIds) {
            return rates.filter(rate => countryKeyIds.includes(rate.countryKeyId))
        }
    })
    const service = new FrozenSmsService(repository, {}, frozenSmsUtilsService, {}, {})
    const reset = () => {
        rates = [
            { keyId: 1, countryKeyId: 101, mcc: '460', upUsd: 20000, downUsd: 10000 },
            { keyId: 2, countryKeyId: 102, mcc: '310', upUsd: 30000, downUsd: 5000 }
        ]
    }

    reset()
    const increased = await service.httpBaseFinanceFluctuateFrozenSms(
        { uid: '1001' },
        { countryKeyIds: [101, 102], mode: 'increase_number', upValue: 0.001, downValue: 0 }
    )
    assert.deepEqual(increased, { count: 2 })
    assert.deepEqual(
        rates.map(rate => [rate.upUsd, rate.downUsd, rate.modifyBy]),
        [
            [21000, 10000, '1001'],
            [31000, 5000, '1001']
        ]
    )

    reset()
    await service.httpBaseFinanceFluctuateFrozenSms(
        { uid: '1001' },
        { countryKeyIds: [101, 102], mode: 'decrease_percent', upValue: 10, downValue: 12.5 }
    )
    assert.deepEqual(
        rates.map(rate => [rate.upUsd, rate.downUsd]),
        [
            [18000, 8750],
            [27000, 4375]
        ]
    )

    reset()
    await assert.rejects(
        () =>
            service.httpBaseFinanceFluctuateFrozenSms(
                { uid: '1001' },
                { countryKeyIds: [101, 102], mode: 'decrease_number', upValue: 0, downValue: 0.006 }
            ),
        /MCC 310 调整后价格小于0/
    )
    await assert.rejects(
        () =>
            service.httpBaseFinanceFluctuateFrozenSms(
                { uid: '1001' },
                { countryKeyIds: [101], mode: 'increase_number', upValue: 0, downValue: 0 }
            ),
        /不能同时为0/
    )
    await assert.rejects(
        () =>
            service.httpBaseFinanceFluctuateFrozenSms(
                { uid: '1001' },
                { countryKeyIds: [101], mode: 'increase_percent', upValue: 1.555, downValue: 0 }
            ),
        /最多保留2位小数/
    )
})

test('短信基础价格枚举返回调价方式', async () => {
    const service = new FrozenSmsService({}, {}, {}, {}, {})
    const result = await service.httpBaseFinanceFrozenSmsEnums()
    assert.deepEqual(
        result.modeOptions.map(item => [item.value, item.label]),
        [
            ['increase_number', '按金额上调'],
            ['increase_percent', '按百分比上调'],
            ['decrease_number', '按金额下调'],
            ['decrease_percent', '按百分比下调']
        ]
    )
})

test('短信基础价格通过 Skyline Feign 查询国家/地区，按 100 个分批并校验必需国家/地区', async () => {
    const calls = []
    const skylineFeignClient = {
        async httpBaseSkylineColumnCountryResolver(authorization, input) {
            calls.push({ authorization, keyIds: input.keyIds })
            return input.keyIds
                .filter(keyId => keyId !== 404)
                .map(keyId => ({ keyId, code: '86', mcc: '460', cnName: '中国', enName: 'China' }))
        }
    }
    const configService = { get: key => (key === 'gateway.feign.service_token' ? 'service-token' : undefined) }
    const service = new FrozenSmsUtilsService({}, {}, skylineFeignClient, configService)
    const keyIds = Array.from({ length: 150 }, (_, index) => index + 1)
    const countries = await service.findCountriesByKeyIds([...keyIds, 1, 0])
    assert.equal(countries.length, 150)
    assert.deepEqual(
        calls.map(call => call.keyIds.length),
        [100, 50]
    )
    assert.equal(calls[0].authorization, 'Bearer service-token')
    assert.deepEqual(await service.findCountriesByKeyIds([]), [])
    await assert.rejects(() => service.findCountriesRequired([1, 404]), /部分国家\/地区不存在/)
})

test('simbank 基础成本价格 Feign 批量查询读取 simbank 表、去重并忽略未配置价格', async () => {
    const { FrozenSimbankUtilsService } = require('../dist/modules/frozen/simbank/simbank.utils.service')
    const queries = []
    const database = {
        async builder(repository, callback) {
            queries.push(repository.name)
            const qb = {
                select() {
                    return qb
                },
                where(_sql, params) {
                    queries.push(params.countryKeyIds)
                    return qb
                },
                async getMany() {
                    return [{ countryKeyId: 2, upUsd: 1500, downUsd: 4500 }]
                }
            }
            return callback(qb)
        }
    }
    const service = Object.assign(new FrozenSimbankUtilsService({ name: 'simbank-repository' }, database, {}, {}), {
        async findCountriesByKeyIds() {
            return [{ keyId: 2, code: '1', mcc: '310', cnName: '美国', enName: 'United States' }]
        }
    })
    assert.deepEqual(await service.findColumnResolver([2, 2, 3]), [
        { countryKeyId: 2, code: '1', mcc: '310', cnName: '美国', enName: 'United States', upUsd: 1500, downUsd: 4500 }
    ])
    assert.deepEqual(queries, ['simbank-repository', [2, 3]])
    await assert.rejects(
        () => Object.assign(service, { findColumnResolver: async () => [] }).findResolver(9),
        error => error.status === 404 && /simbank 基础成本价格/.test(error.message)
    )
})
