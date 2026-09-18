const test = require('node:test')
const assert = require('node:assert/strict')
const { HealthService } = require('../dist/health/health.service')

test('就绪检查覆盖数据库表、独立 Redis 与远程鉴权模式', async () => {
    const service = new HealthService(
        {
            isInitialized: true,
            entityMetadatas: [{ tableName: 'tb_finance_brand' }, { tableName: 'tb_finance_currency' }],
            async query() {
                return [{ tableName: 'tb_finance_brand' }]
            }
        },
        {
            async ping() {
                return true
            }
        }
    )
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['tb_finance_currency'])
    assert.equal(result.auth.mode, 'gateway-principal')
})
