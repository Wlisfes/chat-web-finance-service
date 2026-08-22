const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { HttpExceptionFilter } = require('@wlisfes/chat-web-base-schema/filters')

const { SizePageDto } = require('@wlisfes/chat-web-base-schema/utils')
const { HealthService } = require('../dist/modules/health/health.service')
const { ResolveCurrencyExchangeDto } = require('../dist/modules/currency/dto/currency.dto')
const { BatchSmsRateDto } = require('../dist/modules/sms-rate/dto/sms-rate.dto')
const { TABLE_MIGRATIONS, buildInsertSelectSql, migrateLegacyTables, shouldApplyMigration } = require('../dist/cli/migrate-legacy-finance')
const { createFinanceDemoTables, seedFinanceDemoData, shouldApplyFinanceDemoSeed } = require('../dist/cli/seed-demo-finance')
const { createFinanceConfig, sanitizeFinanceConfig } = require('../deploy/bootstrap-nacos-config.cjs')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

function fakeMigrationConnection() {
    const sourceTables = new Set(['tb_windows_brand'])
    const targetTables = new Set(['tb_finance_brand'])
    const state = { inserts: [], committed: false, rolledBack: false }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) {
                const [database, table] = parameters
                const exists = database === 'legacy_windows' ? sourceTables.has(table) : targetTables.has(table)
                return [[{ count: exists ? 1 : 0 }]]
            }
            throw new Error(`Unexpected execute: ${sql}`)
        },
        async query(sql) {
            if (sql.startsWith('SELECT COUNT(*)')) {
                const source = sql.includes('`legacy_windows`')
                return [[{ count: source ? 2 : 0 }]]
            }
            if (sql.startsWith('INSERT INTO')) {
                state.inserts.push(sql)
                return [{ affectedRows: 2 }]
            }
            throw new Error(`Unexpected query: ${sql}`)
        },
        async beginTransaction() {},
        async commit() {
            state.committed = true
        },
        async rollback() {
            state.rolledBack = true
        }
    }
}

function fakeDemoSeedConnection(nonEmptyTable) {
    const state = { inserts: [], committed: false, rolledBack: false, transactionStarted: false }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) return [[{ count: 1 }]]
            if (sql.startsWith('INSERT INTO')) {
                state.inserts.push({ sql, parameters })
                return [{ affectedRows: 1 }]
            }
            throw new Error(`Unexpected execute: ${sql}`)
        },
        async query(sql) {
            if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: nonEmptyTable && sql.includes(`\`${nonEmptyTable}\``) ? 1 : 0 }]]
            throw new Error(`Unexpected query: ${sql}`)
        },
        async beginTransaction() {
            state.transactionStarted = true
        },
        async commit() {
            state.committed = true
        },
        async rollback() {
            state.rolledBack = true
        }
    }
}

test('CRM 聚合接口使用国家数组和单一币种查询 DTO', async () => {
    const batch = plainToInstance(BatchSmsRateDto, { countryKeyIds: [1, 2, 2] })
    assert.deepEqual(await validate(batch), [])
    assert.ok((await validate(plainToInstance(BatchSmsRateDto, { countryKeyIds: 1 }))).length > 0)
    assert.deepEqual(await validate(plainToInstance(ResolveCurrencyExchangeDto, { currency: 'CNY' })), [])
})

test('分页参数提供默认值并拒绝越界数据', async () => {
    const defaults = plainToInstance(SizePageDto, {})
    assert.deepEqual(await validate(defaults), [])
    assert.equal(defaults.page, 1)
    assert.equal(defaults.size, 50)

    const invalid = plainToInstance(SizePageDto, { page: 0, size: 101 })
    assert.equal((await validate(invalid)).length, 2)
})

test('旧数据迁移默认 dry-run，且只迁移 Finance 所属表', async () => {
    assert.equal(shouldApplyMigration([]), false)
    assert.equal(shouldApplyMigration(['--apply']), true)

    const connection = fakeMigrationConnection()
    const counts = await migrateLegacyTables(connection, 'legacy_windows', 'chat_web_finance', false)
    assert.equal(connection.state.committed, false)
    assert.equal(connection.state.rolledBack, true)
    assert.deepEqual(counts, { tb_finance_brand: 2 })
    assert.equal(connection.state.inserts.length, 1)
    assert.equal(
        TABLE_MIGRATIONS.some(item => item.source.startsWith('tb_windows_client')),
        false
    )
})

test('显式 --apply 才提交旧数据迁移', async () => {
    const connection = fakeMigrationConnection()
    await migrateLegacyTables(connection, 'legacy_windows', 'chat_web_finance', true)
    assert.equal(connection.state.committed, true)
    assert.equal(connection.state.rolledBack, false)
})

test('迁移 SQL 保留旧自增主键并映射汇率日期', () => {
    const exchange = TABLE_MIGRATIONS.find(item => item.source === 'tb_windows_currency_exchange')
    const sql = buildInsertSelectSql(exchange, 'legacy_windows', 'chat_web_finance')
    assert.match(sql, /^INSERT INTO `chat_web_finance`.`tb_finance_currency_exchange` \(`key_id`/)
    assert.match(sql, /`rate_date`.*SELECT.*`date`/)
})

test('Finance 演示数据使用固定种子并覆盖五张所属表', () => {
    const first = createFinanceDemoTables(20260822, '2026-08-22')
    const second = createFinanceDemoTables(20260822, '2026-08-22')
    assert.deepEqual(first, second)
    assert.deepEqual(
        first.map(table => table.table),
        ['tb_finance_brand', 'tb_finance_currency', 'tb_finance_currency_exchange', 'tb_finance_country', 'tb_finance_basic_sms_rate']
    )
    assert.equal(
        first.some(table => table.table.includes('client')),
        false
    )
})

test('Finance 演示数据默认只预览，显式 --apply 才写入并提交', async () => {
    assert.equal(shouldApplyFinanceDemoSeed([]), false)
    assert.equal(shouldApplyFinanceDemoSeed(['--apply']), true)
    const dryRunConnection = fakeDemoSeedConnection()
    const dryRunCounts = await seedFinanceDemoData(dryRunConnection, 'chat_web_finance', false)
    assert.equal(dryRunConnection.state.transactionStarted, false)
    assert.equal(dryRunConnection.state.inserts.length, 0)
    assert.equal(
        Object.values(dryRunCounts).reduce((total, count) => total + count, 0),
        62
    )

    const applyConnection = fakeDemoSeedConnection()
    await seedFinanceDemoData(applyConnection, 'chat_web_finance', true)
    assert.equal(applyConnection.state.transactionStarted, true)
    assert.equal(applyConnection.state.inserts.length, 62)
    assert.equal(applyConnection.state.committed, true)
    assert.equal(applyConnection.state.rolledBack, false)
})

test('Finance 任一目标表已有数据时拒绝混入演示数据', async () => {
    const connection = fakeDemoSeedConnection('tb_finance_currency')
    await assert.rejects(() => seedFinanceDemoData(connection, 'chat_web_finance', true), /演示数据目标表非空：tb_finance_currency/)
    assert.equal(connection.state.transactionStarted, false)
    assert.equal(connection.state.inserts.length, 0)
})

test('首次部署只使用显式 Finance 凭据生成 Nacos 数据库配置', () => {
    const financeConfig = createFinanceConfig({
        FINANCE_MYSQL_HOST: 'mysql',
        FINANCE_MYSQL_PORT: '3306',
        FINANCE_MYSQL_DATABASE: 'chat_web_finance',
        FINANCE_MYSQL_USERNAME: 'finance-service',
        FINANCE_MYSQL_PASSWORD: 'redacted'
    })
    assert.match(financeConfig, /server:\n  port: 3010/)
    assert.match(financeConfig, /database:\n  chat-web-finance:/)
    assert.match(financeConfig, /name: "chat_web_finance"/)
    assert.match(financeConfig, /username: "finance-service"/)
    assert.doesNotMatch(financeConfig, /chat-web-account/)
})

test('已有 Finance Nacos 配置会移除 Account 安全配置', () => {
    const sanitized = sanitizeFinanceConfig(`server:
  port: 3000
database:
  chat-web-finance:
    host: mysql
    name: chat_web_finance
    username: finance-service
    password: redacted
security:
  jwt:
    secret: account-secret
redis:
  database: 0
`)
    assert.match(sanitized, /server:\n  port: 3010/)
    assert.match(sanitized, /database:\n  chat-web-finance:/)
    assert.doesNotMatch(sanitized, /security|account-secret|redis/)
})

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
    assert.equal(result.auth.mode, 'account-service-introspection')
})

test('业务异常使用 HTTP 200 和响应体自定义 code', () => {
    const response = {
        statusCode: undefined,
        body: undefined,
        status(code) {
            this.statusCode = code
            return this
        },
        json(body) {
            this.body = body
        }
    }
    const host = {
        switchToHttp() {
            return {
                getRequest() {
                    return { method: 'POST', originalUrl: '/brand/create', headers: {} }
                },
                getResponse() {
                    return response
                }
            }
        }
    }

    new HttpExceptionFilter().catch(new BadRequestException('品牌参数错误'), host)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.code, 400)
    assert.equal(response.body.message, '品牌参数错误')
    assert.deepEqual(Object.keys(response.body), ['data', 'code', 'message', 'timestamp'])
})
