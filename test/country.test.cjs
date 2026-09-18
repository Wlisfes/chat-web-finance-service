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
    await countryService.httpBaseFinanceUpdateCountryStatus({ keyId: 1, status: 'disable' })
    assert.equal(countryTransactional.repository.state.transactions, 1)
    assert.equal(country.status, 'disable')
})
