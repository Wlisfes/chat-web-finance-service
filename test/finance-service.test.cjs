const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException, UnauthorizedException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { HttpExceptionFilter } = require('@wlisfes/chat-web-base-schema/filters')

const { PageDto } = require('../dist/common/dto/page.dto')
const { AccountAuthClient } = require('../dist/modules/auth/account-auth.client')
const { HealthService } = require('../dist/modules/health/health.service')
const { TABLE_MIGRATIONS, buildInsertSelectSql, migrateLegacyTables, shouldApplyMigration } = require('../dist/cli/migrate-legacy-finance')
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

test('分页参数提供默认值并拒绝越界数据', async () => {
    const defaults = plainToInstance(PageDto, {})
    assert.deepEqual(await validate(defaults), [])
    assert.equal(defaults.page, 1)
    assert.equal(defaults.size, 50)

    const invalid = plainToInstance(PageDto, { page: 0, size: 101 })
    assert.equal((await validate(invalid)).length, 2)
})

test('财务服务通过账号 HTTP 接口校验 Token，不读取账号 Redis 会话', async () => {
    let request
    const service = new AccountAuthClient(config({ ACCOUNT_SERVICE_URL: 'http://account.internal:3000' }), async (url, init) => {
        request = { url: String(url), init }
        return new Response(
            JSON.stringify({
                data: { uid: '2149446185344106496', sessionId: 'finance-test-session' },
                code: 200,
                message: 'success',
                timestamp: '2026-08-19 12:00:00'
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        )
    })

    assert.deepEqual(await service.authenticateToken('account-token'), {
        uid: '2149446185344106496',
        sessionId: 'finance-test-session'
    })
    assert.equal(request.url, 'http://account.internal:3000/auth/introspect')
    assert.equal(request.init.headers.authorization, 'Bearer account-token')
})

test('账号鉴权接口拒绝 Token 时财务服务返回未授权', async () => {
    const service = new AccountAuthClient(config({}), async () => {
        return new Response(JSON.stringify({ data: null, code: 401, message: '会话已失效', timestamp: '2026-08-19 12:00:00' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
        })
    })

    await assert.rejects(() => service.authenticateToken('expired-token'), UnauthorizedException)
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
