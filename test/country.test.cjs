const test = require('node:test')
const assert = require('node:assert/strict')
const { CountryService } = require('../dist/modules/country/country.service')

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

test('国家状态更新在事务内锁定实体后写入', async () => {
    const countryTransactional = fakeTransactionalRepository()
    const country = { keyId: 1, status: 'enable' }
    const countryUtilsService = {
        async findRequired(keyId, manager) {
            assert.equal(keyId, 1)
            assert.equal(manager, countryTransactional.manager)
            return country
        }
    }
    const countryService = new CountryService(countryTransactional.repository, {}, countryUtilsService)
    await countryService.httpBaseFinanceUpdateCountryStatus({ uid: '1001' }, { keyId: 1, status: 'disable' })
    assert.equal(countryTransactional.repository.state.transactions, 1)
    assert.equal(country.status, 'disable')
    assert.equal(country.modifyBy, '1001')
})

test('国家地区列表通过 Account Feign 还原创建人和更新人', async () => {
    const items = [
        { keyId: 1, cnName: '中国', createBy: '0', modifyBy: '1001' },
        { keyId: 2, cnName: '美国', createBy: '1001', modifyBy: null }
    ]
    const calls = []
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
    const database = { builder: (repository, callback) => callback(qb) }
    const accountFeignClient = {
        async httpBaseAccountColumnUserResolver(authorization, body) {
            calls.push({ authorization, body })
            return [{ uid: '1001', number: '1001', name: '张三' }]
        }
    }
    const configService = { get: () => 'service-token' }
    const service = new CountryService({}, database, {}, accountFeignClient, configService)

    const result = await service.httpBaseFinanceColumnCountry({ page: 1, size: 10 })
    assert.equal(result.total, 2)
    assert.deepEqual(calls, [{ authorization: 'Bearer service-token', body: { uids: ['1001'] } }])
    assert.deepEqual(result.list[0].createByOptions, { uid: '0', name: '系统' })
    assert.deepEqual(result.list[0].modifyByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.deepEqual(result.list[1].createByOptions, { uid: '1001', number: '1001', name: '张三' })
    assert.equal(result.list[1].modifyByOptions, undefined)
})
