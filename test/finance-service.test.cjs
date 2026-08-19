const test = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const { BadRequestException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { AuthSessionService, TokenService } = require('@wlisfes/chat-web-base-schema/auth')
const { HttpExceptionFilter } = require('@wlisfes/chat-web-base-schema/filters')

const { PageDto } = require('../dist/common/dto/page.dto')
const { HealthService } = require('../dist/modules/health/health.service')
const { TABLE_MIGRATIONS, buildInsertSelectSql, migrateLegacyTables, shouldApplyMigration } = require('../dist/cli/migrate-legacy-finance')
const { createFinanceConfig } = require('../deploy/bootstrap-nacos-config.cjs')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

function issueToken(secret, claims) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
    return `${header}.${payload}.${signature}`
}

function fakeMigrationConnection() {
    const sourceTables = new Set(['tb_windows_brand', 'tb_windows_client', 'tb_windows_client_settings'])
    const targetTables = new Set(['tb_finance_brand', 'tb_finance_client', 'tb_finance_client_settings'])
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

test('JWT 使用账号服务声明并拒绝篡改签名', () => {
    const secret = '0123456789abcdef0123456789abcdef'
    const now = Math.floor(Date.now() / 1000)
    const claims = {
        sub: '2149446185344106496',
        iss: 'chat-web-account-service',
        aud: 'chat-web',
        iat: now,
        exp: now + 600,
        jti: 'finance-test-session'
    }
    const service = new TokenService(config({ JWT_SECRET: secret }))
    const token = issueToken(secret, claims)
    assert.deepEqual(service.verifyAccessToken(token), claims)

    const parts = token.split('.')
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`
    assert.throws(() => service.verifyAccessToken(parts.join('.')), /签名/)
})

test('Redis 会话必须与账号服务登录会话一致', async () => {
    const values = new Map([['test:session:active', '2149446185344106496']])
    const service = new AuthSessionService(
        {
            async get(key) {
                return values.get(key) ?? null
            }
        },
        config({ AUTH_SESSION_PREFIX: 'test:session' })
    )
    const active = { sub: '2149446185344106496', jti: 'active' }
    await service.assertActive(active)
    await assert.rejects(() => service.assertActive({ ...active, jti: 'expired' }), /会话已失效/)
})

test('旧数据迁移默认 dry-run，且兼容部分旧表和历史字段名', async () => {
    assert.equal(shouldApplyMigration([]), false)
    assert.equal(shouldApplyMigration(['--apply']), true)

    const connection = fakeMigrationConnection()
    const counts = await migrateLegacyTables(connection, 'legacy_windows', 'chat-web-finance', false)
    assert.equal(connection.state.committed, false)
    assert.equal(connection.state.rolledBack, true)
    assert.deepEqual(counts, {
        tb_finance_brand: 2,
        tb_finance_client: 2,
        tb_finance_client_settings: 2
    })
    assert.equal(connection.state.inserts.length, 3)
    assert.match(connection.state.inserts[1], /`owner_user_uid`.*`brand_key_id`.*SELECT.*`userId`.*`brand_id`/)
    assert.match(connection.state.inserts[2], /`mail_active`.*`social_active`.*SELECT.*`main_active`.*`meta_active`/)
})

test('显式 --apply 才提交旧数据迁移', async () => {
    const connection = fakeMigrationConnection()
    await migrateLegacyTables(connection, 'legacy_windows', 'chat-web-finance', true)
    assert.equal(connection.state.committed, true)
    assert.equal(connection.state.rolledBack, false)
})

test('迁移 SQL 保留旧自增主键并映射汇率日期', () => {
    const exchange = TABLE_MIGRATIONS.find(item => item.source === 'tb_windows_currency_exchange')
    const sql = buildInsertSelectSql(exchange, 'legacy_windows', 'chat-web-finance')
    assert.match(sql, /^INSERT INTO `chat-web-finance`.`tb_finance_currency_exchange` \(`key_id`/)
    assert.match(sql, /`rate_date`.*SELECT.*`date`/)
})

test('首次部署只派生 Finance Nacos 数据库配置', () => {
    const financeConfig = createFinanceConfig(`server:
  port: 3000
database:
  chat-web-account:
    host: mysql
    name: chat-web-account
    username: service
    password: redacted
security:
  feature: account-only
`)
    assert.match(financeConfig, /server:\n  port: 3010/)
    assert.match(financeConfig, /database:\n  chat-web-finance:/)
    assert.match(financeConfig, /name: chat-web-finance/)
    assert.match(financeConfig, /security:\n  feature: account-only/)
    assert.doesNotMatch(financeConfig, /chat-web-account/)
})

test('就绪检查覆盖数据库表、Redis 与 JWT 密钥', async () => {
    const service = new HealthService(
        {
            isInitialized: true,
            entityMetadatas: [{ tableName: 'tb_finance_brand' }, { tableName: 'tb_finance_client' }],
            async query() {
                return [{ tableName: 'tb_finance_brand' }]
            }
        },
        config({ JWT_SECRET: '0123456789abcdef0123456789abcdef' }),
        {
            async ping() {
                return true
            }
        }
    )
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['tb_finance_client'])
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
