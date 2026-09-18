const test = require('node:test')
const assert = require('node:assert/strict')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { CurrencyService } = require('../dist/modules/currency/currency.service')
const { CurrencyExchangeSyncService } = require('../dist/modules/currency/currency-exchange-sync.service')
const { ResolveCurrencyExchangeDto } = require('../dist/modules/currency/dto/currency.dto')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

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

function fakeExchangeSyncRepository(existingCurrencies = []) {
    const state = { transactions: 0, inserts: [], existingCurrencies }
    const manager = {
        async find() {
            return state.existingCurrencies.map(currency => ({ currency }))
        },
        createQueryBuilder() {
            const builder = {
                into(entity) {
                    builder.entity = entity
                    return builder
                },
                values(values) {
                    builder.values = values
                    return builder
                },
                updateEntity(enabled) {
                    builder.updateEntity = enabled
                    return builder
                },
                async execute() {
                    state.inserts.push({
                        entity: builder.entity,
                        values: builder.values,
                        updateEntity: builder.updateEntity
                    })
                    return { identifiers: builder.values.map((_, index) => ({ keyId: index + 1 })) }
                }
            }
            return {
                insert() {
                    return builder
                }
            }
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                state.transactions += 1
                return callback(manager)
            }
        }
    }
    return { repository, state }
}

function mockJsonResponse(payload, ok = true, status = 200) {
    return {
        ok,
        status,
        async json() {
            return payload
        }
    }
}

function createCurrencyExchangeSyncService(values = {}, enabledCurrencies = ['USD', 'CNY', 'EUR'], existingCurrencies = []) {
    const { repository, state } = fakeExchangeSyncRepository(existingCurrencies)
    const service = new CurrencyExchangeSyncService(
        repository,
        {
            async findEnabledCurrencies() {
                return new Set(enabledCurrencies)
            }
        },
        config(values)
    )
    return { service, state }
}

test('单一币种查询 DTO 使用 currency 字段', async () => {
    assert.deepEqual(await validate(plainToInstance(ResolveCurrencyExchangeDto, { currency: 'CNY' })), [])
})

test('Finance 使用 Open Exchange Rates、过滤未启用币种并只新增汇率', async () => {
    const originalFetch = global.fetch
    const { service, state } = createCurrencyExchangeSyncService(
        {
            'integration.openExchangeRates.appid': 'test-app-id',
            'integration.openExchangeRates.timeout': 5000
        },
        ['USD', 'CNY']
    )
    global.fetch = async () => mockJsonResponse({ base: 'USD', rates: { USD: 1, CNY: 7.1234567, EUR: 0.92, 'US D': 1 } })

    try {
        const result = await service.httpBaseFinanceSyncCurrencyExchange()

        assert.equal(state.transactions, 1)
        assert.equal(state.inserts[0].updateEntity, false)
        assert.equal(state.inserts[0].values.length, 2)
        assert.deepEqual(state.inserts[0].values, [
            { currency: 'USD', rate: 1, rateDate: result.date },
            { currency: 'CNY', rate: 7.123457, rateDate: result.date }
        ])
        assert.deepEqual(result, {
            date: result.date,
            count: 2,
            list: [
                { currency: 'USD', rate: 1, date: result.date },
                { currency: 'CNY', rate: 7.123457, date: result.date }
            ]
        })
    } finally {
        global.fetch = originalFetch
    }
})

test('Finance 已存在当日汇率时不更新也不重复插入', async () => {
    const originalFetch = global.fetch
    const { service, state } = createCurrencyExchangeSyncService(
        { 'integration.openExchangeRates.appid': 'test-app-id' },
        ['USD', 'CNY'],
        ['USD', 'CNY']
    )
    global.fetch = async () => mockJsonResponse({ base: 'USD', rates: { USD: 1, CNY: 7.1 } })

    try {
        const result = await service.httpBaseFinanceSyncCurrencyExchange()
        assert.equal(result.count, 0)
        assert.equal(state.inserts.length, 0)
    } finally {
        global.fetch = originalFetch
    }
})

test('Finance Open Exchange Rates 请求发生瞬时连接失败时应退避重试', async () => {
    const originalFetch = global.fetch
    const { service } = createCurrencyExchangeSyncService({ 'integration.openExchangeRates.appid': 'test-app-id' })
    let calls = 0
    global.fetch = async () => {
        calls += 1
        if (calls === 1) throw new Error('连接暂不可用')
        return mockJsonResponse({ base: 'USD', rates: { CNY: 7.1, EUR: 0.91 } })
    }

    try {
        const result = await service.httpBaseFinanceSyncCurrencyExchange()
        assert.equal(calls, 2)
        assert.match(result.date, /^\d{4}-\d{2}-\d{2}$/)
        assert.equal(result.count, 3)
    } finally {
        global.fetch = originalFetch
    }
})

test('Finance Open Exchange Rates App ID 缺失时直接拒绝同步', async () => {
    const { service, state } = createCurrencyExchangeSyncService()

    await assert.rejects(() => service.httpBaseFinanceSyncCurrencyExchange(), /integration\.openExchangeRates\.appid/)
    assert.equal(state.transactions, 0)
})

test('币种状态更新在事务内锁定实体后写入', async () => {
    const currencyTransactional = fakeTransactionalRepository()
    const currency = { keyId: 2, status: 'enable' }
    const currencyUtilsService = {
        async findRequired(keyId, manager) {
            assert.equal(keyId, 2)
            assert.equal(manager, currencyTransactional.manager)
            return currency
        }
    }
    const currencyService = new CurrencyService(currencyTransactional.repository, {}, {}, currencyUtilsService)
    await currencyService.httpBaseFinanceUpdateCurrencyStatus({ keyId: 2, status: 'disable' })
    assert.equal(currencyTransactional.repository.state.transactions, 1)
    assert.equal(currency.status, 'disable')
})
