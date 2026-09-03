const test = require('node:test')
const assert = require('node:assert/strict')
const { ConfigService } = require('@nestjs/config')
const { syncFeignConfiguration } = require('../dist/modules/feign/feign-config.module')

test('Finance 读取 Account Feign 地址和超时', () => {
    const config = new ConfigService({
        feign: {
            'chat-web-account': { url: 'http://chat-web-account-service:5010', timeout: 3000 },
            'chat-web-crm': { url: 'http://chat-web-crm-service:5020', timeout: 3000 },
            'chat-web-skyline': { url: 'http://chat-web-skyline-service:5040', timeout: 3000 }
        }
    })

    syncFeignConfiguration(config)

    assert.equal(config.get('ACCOUNT_SERVICE_URL'), 'http://chat-web-account-service:5010')
    assert.equal(config.get('ACCOUNT_AUTH_TIMEOUT_MS'), 3000)
    assert.equal(config.get('CRM_SERVICE_URL'), 'http://chat-web-crm-service:5020')
    assert.equal(config.get('SKYLINE_SERVICE_URL'), 'http://chat-web-skyline-service:5040')
})

test('Finance 的显式环境变量优先于 Nacos Feign 地址', () => {
    const previous = process.env.ACCOUNT_SERVICE_URL
    process.env.ACCOUNT_SERVICE_URL = 'http://override:5010'
    try {
        const config = new ConfigService({
            feign: { 'chat-web-account': { url: 'http://chat-web-account-service:5010', timeout: 3000 } }
        })
        syncFeignConfiguration(config)
        assert.equal(config.get('ACCOUNT_SERVICE_URL'), 'http://override:5010')
    } finally {
        if (previous === undefined) delete process.env.ACCOUNT_SERVICE_URL
        else process.env.ACCOUNT_SERVICE_URL = previous
    }
})
