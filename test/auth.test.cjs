const test = require('node:test')
const assert = require('node:assert/strict')
const { FinanceAuthGuard } = require('../dist/modules/auth/finance-auth.guard')
const { FINANCE_SERVICE_TOKEN_ALLOWED } = require('../dist/modules/auth/finance-auth.decorator')

test('Finance 汇率同步支持专用服务凭据且不绕过普通 Bearer 鉴权', async () => {
    const calls = { jwt: 0 }
    const reflector = {
        getAllAndOverride(key) {
            return key === FINANCE_SERVICE_TOKEN_ALLOWED
        }
    }
    const configService = {
        get(key) {
            return key === 'gateway.feign.service_token' ? 'finance-sync-secret' : undefined
        }
    }
    const jwtAuthGuard = {
        async canActivate() {
            calls.jwt += 1
            return true
        }
    }
    const guard = new FinanceAuthGuard(reflector, configService, jwtAuthGuard)
    const context = authorization => ({
        getHandler() {},
        getClass() {},
        switchToHttp() {
            return { getRequest: () => ({ header: () => authorization }) }
        }
    })

    assert.equal(await guard.canActivate(context('Bearer finance-sync-secret')), true)
    assert.equal(calls.jwt, 0)
    assert.equal(await guard.canActivate(context('Bearer account-token')), true)
    assert.equal(calls.jwt, 1)

    const missingConfigGuard = new FinanceAuthGuard(reflector, { get: () => undefined }, jwtAuthGuard)
    assert.equal(await missingConfigGuard.canActivate(context('Bearer finance-sync-secret')), true)
    assert.equal(calls.jwt, 2)
})
