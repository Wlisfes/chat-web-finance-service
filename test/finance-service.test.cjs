const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')
const { HttpExceptionFilter } = require('@wlisfes/chat-web-base-schema/filters')

const { SizePageDto } = require('@wlisfes/chat-web-base-schema/utils')
const { HealthService } = require('../dist/modules/health/health.service')
const { BrandService } = require('../dist/modules/brand/brand.service')
const { CountryService } = require('../dist/modules/country/country.service')
const { CurrencyService } = require('../dist/modules/currency/currency.service')
const { ResolveCurrencyExchangeDto, SyncCurrencyExchangeDto } = require('../dist/modules/currency/dto/currency.dto')
const { FinanceAuthGuard } = require('../dist/modules/auth/finance-auth.guard')
const { FINANCE_SERVICE_TOKEN_ALLOWED } = require('../dist/modules/auth/finance-auth.decorator')
const { BatchSmsRateDto } = require('../dist/modules/sms-rate/dto/sms-rate.dto')
const { SmsRateService } = require('../dist/modules/sms-rate/sms-rate.service')
const { TABLE_MIGRATIONS, buildInsertSelectSql, migrateLegacyTables, shouldApplyMigration } = require('../dist/cli/migrate-legacy-finance')
const { FINANCE_COUNTRY_DATA } = require('../dist/cli/finance-country-data')
const {
    createFinanceDemoTables,
    FINANCE_COMMON_CURRENCIES,
    seedFinanceDemoData,
    shouldApplyFinanceDemoSeed,
    shouldSyncFinanceCountries,
    shouldSyncFinanceCurrencies,
    syncFinanceCountries,
    syncFinanceCurrencies
} = require('../dist/cli/seed-demo-finance')
const { createFinanceConfig, sanitizeFinanceConfig } = require('../deploy/bootstrap-nacos-config.cjs')
const { RATE_DATE_RENAME_MIGRATION, ensureCurrencyExchangeDateColumn } = require('../dist/cli/apply-schema')

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

function fakeExchangeSyncRepository() {
    const state = { transactions: 0, upserts: [] }
    const manager = {
        async upsert(entity, values, conflictPaths) {
            state.upserts.push({ entity, values, conflictPaths })
            return { identifiers: values.map((_, index) => ({ keyId: index + 1 })) }
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

function fakePageQueryBuilder(items, total) {
    const calls = []
    const queryBuilder = {
        calls,
        andWhere(sql, parameters) {
            calls.push({ method: 'andWhere', sql, parameters })
            return queryBuilder
        },
        orderBy(column, direction) {
            calls.push({ method: 'orderBy', column, direction })
            return queryBuilder
        },
        skip(value) {
            calls.push({ method: 'skip', value })
            return queryBuilder
        },
        take(value) {
            calls.push({ method: 'take', value })
            return queryBuilder
        },
        async getManyAndCount() {
            calls.push({ method: 'getManyAndCount' })
            return [items, total]
        }
    }
    return queryBuilder
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

function fakeRateDateMigrationConnection(columns) {
    const state = { altered: false }
    return {
        state,
        async query(sql) {
            if (sql.includes('information_schema.columns')) {
                return [columns.map(columnName => ({ columnName }))]
            }
            if (sql.startsWith('ALTER TABLE `tb_finance_currency_exchange`')) {
                state.altered = true
                return []
            }
            throw new Error(`Unexpected query: ${sql}`)
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

function fakeCountrySyncConnection(initialRows = []) {
    const state = {
        rows: new Map(initialRows.map(row => [`${row.code}:${row.mcc}`, { ...row }])),
        inserts: [],
        transactions: 0,
        commits: 0,
        rollbacks: 0
    }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) return [[{ count: 1 }]]
            if (sql.startsWith('SELECT COUNT(*) count')) {
                const count = [...state.rows.values()].filter(
                    row => row.code.startsWith('+') && state.rows.has(`${row.code.slice(1)}:${row.mcc}`)
                ).length
                return [[{ count }]]
            }
            if (sql.startsWith('UPDATE `tb_finance_country`')) {
                for (const [key, row] of [...state.rows]) {
                    if (!row.code.startsWith('+')) continue
                    state.rows.delete(key)
                    const normalized = { ...row, code: row.code.slice(1) }
                    state.rows.set(`${normalized.code}:${normalized.mcc}`, normalized)
                }
                return [{ affectedRows: 0 }]
            }
            if (sql.startsWith('UPDATE `tb_finance_basic_sms_rate`')) return [{ affectedRows: 0 }]
            if (!sql.startsWith('INSERT INTO')) throw new Error(`Unexpected execute: ${sql}`)

            const [code, mcc, cnName, enName] = parameters
            const key = `${code}:${mcc}`
            const existing = state.rows.get(key)
            const updatesStatus = /`status`\s*=\s*VALUES\(`status`\)/i.test(sql)
            state.inserts.push({ sql, parameters })
            state.rows.set(key, {
                ...existing,
                code,
                mcc,
                cnName,
                enName,
                status: existing && !updatesStatus ? existing.status : 'enable'
            })
            return [{ affectedRows: existing ? 2 : 1 }]
        },
        async beginTransaction() {
            state.transactions += 1
        },
        async commit() {
            state.commits += 1
        },
        async rollback() {
            state.rollbacks += 1
        }
    }
}

test('CRM 聚合接口使用国家数组和单一币种查询 DTO', async () => {
    const batch = plainToInstance(BatchSmsRateDto, { countryKeyIds: [1, 2, 2] })
    assert.deepEqual(await validate(batch), [])
    assert.ok((await validate(plainToInstance(BatchSmsRateDto, { countryKeyIds: 1 }))).length > 0)
    assert.deepEqual(await validate(plainToInstance(ResolveCurrencyExchangeDto, { currency: 'CNY' })), [])
})

test('汇率同步 DTO 校验数组并规范化币种编码', async () => {
    const dto = plainToInstance(SyncCurrencyExchangeDto, {
        date: '2026-09-02',
        rates: [
            { currency: ' cny ', rate: '7.2534' },
            { currency: 'EUR', rate: 0.92 }
        ]
    })
    assert.deepEqual(await validate(dto), [])
    assert.equal(dto.rates[0].currency, 'CNY')
    assert.equal(dto.rates[0].rate, 7.2534)
    assert.ok((await validate(plainToInstance(SyncCurrencyExchangeDto, { date: '2026-09-02', rates: {} }))).length > 0)
})

test('汇率同步按币种和日期事务幂等写入并返回统一结果', async () => {
    const { repository, state } = fakeExchangeSyncRepository()
    const service = new CurrencyService(
        {},
        repository,
        {},
        {
            async findEnabledCurrencies(currencies) {
                return new Set(currencies)
            }
        }
    )
    const result = await service.httpBaseFinanceSyncCurrencyExchange({
        date: '2026-09-02T00:00:00.000Z',
        rates: [
            { currency: ' cny ', rate: 7.2534 },
            { currency: 'eur', rate: 0.92 }
        ]
    })

    assert.equal(state.transactions, 1)
    assert.deepEqual(state.upserts[0].values, [
        { currency: 'CNY', rate: 7.2534, rateDate: '2026-09-02' },
        { currency: 'EUR', rate: 0.92, rateDate: '2026-09-02' }
    ])
    assert.deepEqual(state.upserts[0].conflictPaths, ['currency', 'rateDate'])
    assert.deepEqual(result, {
        date: '2026-09-02',
        count: 2,
        list: [
            { currency: 'CNY', rate: 7.2534, date: '2026-09-02' },
            { currency: 'EUR', rate: 0.92, date: '2026-09-02' }
        ]
    })
})

test('汇率同步拒绝重复币种，避免覆盖请求内数据', async () => {
    const { repository, state } = fakeExchangeSyncRepository()
    const service = new CurrencyService(
        {},
        repository,
        {},
        {
            async findEnabledCurrencies(currencies) {
                return new Set(currencies)
            }
        }
    )
    await assert.rejects(
        () =>
            service.httpBaseFinanceSyncCurrencyExchange({
                date: '2026-09-02',
                rates: [
                    { currency: 'CNY', rate: 7 },
                    { currency: 'cny', rate: 8 }
                ]
            }),
        /汇率币种重复：CNY/
    )
    assert.equal(state.transactions, 0)
})

test('汇率同步只写入已启用币种并保留明确传入的 USD', async () => {
    const { repository, state } = fakeExchangeSyncRepository()
    const service = new CurrencyService(
        {},
        repository,
        {},
        {
            async findEnabledCurrencies() {
                return new Set(['CNY'])
            }
        }
    )
    const result = await service.httpBaseFinanceSyncCurrencyExchange({
        date: '2026-09-02',
        rates: [
            { currency: 'USD', rate: 1 },
            { currency: 'CNY', rate: 7.25 },
            { currency: 'EUR', rate: 0.92 }
        ]
    })

    assert.deepEqual(state.upserts[0].values, [
        { currency: 'USD', rate: 1, rateDate: '2026-09-02' },
        { currency: 'CNY', rate: 7.25, rateDate: '2026-09-02' }
    ])
    assert.deepEqual(result.list, [
        { currency: 'USD', rate: 1, date: '2026-09-02' },
        { currency: 'CNY', rate: 7.25, date: '2026-09-02' }
    ])
})

test('Finance 汇率同步支持专用服务凭据且不绕过普通 Bearer 鉴权', async () => {
    const calls = { jwt: 0 }
    const reflector = {
        getAllAndOverride(key) {
            return key === FINANCE_SERVICE_TOKEN_ALLOWED
        }
    }
    const configService = {
        get(key) {
            return key === 'feign.service_token' ? 'finance-sync-secret' : undefined
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

test('分页参数提供默认值并拒绝越界数据', async () => {
    const defaults = plainToInstance(SizePageDto, {})
    assert.deepEqual(await validate(defaults), [])
    assert.equal(defaults.page, 1)
    assert.equal(defaults.size, 50)

    const invalid = plainToInstance(SizePageDto, { page: 0, size: 101 })
    assert.equal((await validate(invalid)).length, 2)
})

test('品牌新增和编辑在事务内完成唯一性校验与写入', async () => {
    const { manager, repository } = fakeTransactionalRepository()
    const calls = []
    const existingBrand = { keyId: 8, name: '旧品牌', document: '旧说明', createBy: '10001', modifyBy: '10001' }
    const brandUtilsService = {
        async findNameAvailable(name, transactionManager, excludedKeyId) {
            calls.push({ method: 'findNameAvailable', name, transactionManager, excludedKeyId })
        },
        async findRequired(keyId, transactionManager) {
            calls.push({ method: 'findRequired', keyId, transactionManager })
            return existingBrand
        }
    }
    const service = new BrandService(repository, {}, brandUtilsService, {})

    const createBody = { name: '新品牌', document: '新增说明', status: 'enable' }
    const created = await service.httpBaseFinanceCreateBrand({ uid: '20001' }, createBody)

    assert.equal(repository.state.transactions, 1)
    assert.deepEqual(calls[0], {
        method: 'findNameAvailable',
        name: '新品牌',
        transactionManager: manager,
        excludedKeyId: undefined
    })
    assert.deepEqual(repository.state.creates[0].values, {
        ...createBody,
        createBy: '20001',
        modifyBy: '20001'
    })
    assert.equal(repository.state.saves[0], created)

    const updateBody = { keyId: 8, name: '更新品牌', document: '更新说明', status: 'disable' }
    const updated = await service.httpBaseFinanceUpdateBrand({ uid: '30001' }, updateBody)

    assert.equal(repository.state.transactions, 2)
    assert.deepEqual(calls[1], { method: 'findRequired', keyId: 8, transactionManager: manager })
    assert.deepEqual(calls[2], {
        method: 'findNameAvailable',
        name: '更新品牌',
        transactionManager: manager,
        excludedKeyId: 8
    })
    assert.deepEqual(repository.state.merges[0].values, { ...updateBody, modifyBy: '30001' })
    assert.equal(repository.state.saves[1], existingBrand)
    assert.equal(updated, existingBrand)
    assert.equal(updated.createBy, '10001')
    assert.equal(updated.modifyBy, '30001')

    const statusUpdated = await service.httpBaseFinanceUpdateBrandStatus({ uid: '40001' }, { keyId: 8, status: 'enable' })
    assert.equal(repository.state.transactions, 3)
    assert.deepEqual(calls[3], { method: 'findRequired', keyId: 8, transactionManager: manager })
    assert.equal(statusUpdated.status, 'enable')
    assert.equal(statusUpdated.modifyBy, '40001')
})

test('国家地区和币种状态更新在事务内锁定实体后写入', async () => {
    const countryTransactional = fakeTransactionalRepository()
    const currencyTransactional = fakeTransactionalRepository()
    const country = { keyId: 1, status: 'enable' }
    const currency = { keyId: 2, status: 'enable' }
    const countryUtilsService = {
        async findRequired(keyId, manager) {
            assert.equal(keyId, 1)
            assert.equal(manager, countryTransactional.manager)
            return country
        }
    }
    const currencyUtilsService = {
        async findRequired(keyId, manager) {
            assert.equal(keyId, 2)
            assert.equal(manager, currencyTransactional.manager)
            return currency
        }
    }
    const countryService = new CountryService(countryTransactional.repository, {}, countryUtilsService)
    const currencyService = new CurrencyService(currencyTransactional.repository, {}, {}, currencyUtilsService)

    await countryService.httpBaseFinanceUpdateCountryStatus({ keyId: 1, status: 'disable' })
    await currencyService.httpBaseFinanceUpdateCurrencyStatus({ keyId: 2, status: 'disable' })

    assert.equal(countryTransactional.repository.state.transactions, 1)
    assert.equal(currencyTransactional.repository.state.transactions, 1)
    assert.equal(country.status, 'disable')
    assert.equal(currency.status, 'disable')
})

test('短信价格新增和编辑在事务内完成组合唯一性校验与写入', async () => {
    const { manager, repository } = fakeTransactionalRepository()
    const calls = []
    const existingRate = { keyId: 18, code: '86', mcc: '460', upUsd: 0.02, downUsd: 0.01, createBy: '10001', modifyBy: '10001' }
    const smsRateUtilsService = {
        async findAvailable(code, mcc, transactionManager, excludedKeyId) {
            calls.push({ method: 'findAvailable', code, mcc, transactionManager, excludedKeyId })
        },
        async findRequired(keyId, transactionManager) {
            calls.push({ method: 'findRequired', keyId, transactionManager })
            return existingRate
        }
    }
    const service = new SmsRateService(repository, {}, smsRateUtilsService)

    const createBody = { code: '1', mcc: '310', upUsd: 0.03, downUsd: 0.02, remark: '北美价格' }
    const created = await service.httpBaseFinanceCreateSmsRate({ uid: '20001' }, createBody)

    assert.equal(repository.state.transactions, 1)
    assert.deepEqual(calls[0], {
        method: 'findAvailable',
        code: '1',
        mcc: '310',
        transactionManager: manager,
        excludedKeyId: undefined
    })
    assert.deepEqual(repository.state.creates[0].values, {
        ...createBody,
        createBy: '20001',
        modifyBy: '20001'
    })
    assert.equal(repository.state.saves[0], created)

    const updateBody = { keyId: 18, code: '852', mcc: '454', upUsd: 0.04, downUsd: 0.03, remark: '香港价格' }
    const updated = await service.httpBaseFinanceUpdateSmsRate({ uid: '30001' }, updateBody)

    assert.equal(repository.state.transactions, 2)
    assert.deepEqual(calls[1], { method: 'findRequired', keyId: 18, transactionManager: manager })
    assert.deepEqual(calls[2], {
        method: 'findAvailable',
        code: '852',
        mcc: '454',
        transactionManager: manager,
        excludedKeyId: 18
    })
    assert.deepEqual(repository.state.merges[0].values, { ...updateBody, modifyBy: '30001' })
    assert.equal(repository.state.saves[1], existingRate)
    assert.equal(updated, existingRate)
    assert.equal(updated.createBy, '10001')
    assert.equal(updated.modifyBy, '30001')
})

test('品牌分页通过 DataBaseService builder 查询并返回统一分页结构', async () => {
    const repository = {}
    const items = [
        { keyId: 1, name: '品牌一', createBy: '10001', modifyBy: '10002' },
        { keyId: 2, name: '品牌二', createBy: '10001', modifyBy: undefined },
        { keyId: 3, name: '品牌三', createBy: undefined, modifyBy: undefined }
    ]
    const queryBuilder = fakePageQueryBuilder(items, 32)
    const state = { builderCalls: 0, repository: undefined }
    const database = {
        async builder(inputRepository, callback) {
            state.builderCalls += 1
            state.repository = inputRepository
            return callback(queryBuilder)
        }
    }
    const accountFeignClient = {
        calls: [],
        async batchResolveUsers(authorization, input) {
            this.calls.push({ authorization, input })
            return input.uids.map(uid => ({
                uid,
                number: `00${uid}`,
                name: `用户${uid}`,
                avatar: `https://example.com/${uid}.png`
            }))
        }
    }
    const configService = { get: key => (key === 'feign.service_token' ? 'service-token' : undefined) }
    const service = new BrandService(repository, database, {}, accountFeignClient, configService)

    const result = await service.httpBaseFinanceColumnBrand({ page: 2, size: 10, name: ' 品牌 ', status: 'enable' })

    assert.equal(state.builderCalls, 1)
    assert.equal(state.repository, repository)
    assert.deepEqual(queryBuilder.calls, [
        { method: 'andWhere', sql: 't.name LIKE :name', parameters: { name: '%品牌%' } },
        { method: 'andWhere', sql: 't.status = :status', parameters: { status: 'enable' } },
        { method: 'orderBy', column: 't.createTime', direction: 'DESC' },
        { method: 'skip', value: 10 },
        { method: 'take', value: 10 },
        { method: 'getManyAndCount' }
    ])
    assert.deepEqual(result, {
        page: 2,
        size: 10,
        total: 32,
        list: [
            {
                ...items[0],
                createByOptions: { uid: '10001', number: '0010001', name: '用户10001', avatar: 'https://example.com/10001.png' },
                modifyByOptions: { uid: '10002', number: '0010002', name: '用户10002', avatar: 'https://example.com/10002.png' }
            },
            {
                ...items[1],
                createByOptions: { uid: '10001', number: '0010001', name: '用户10001', avatar: 'https://example.com/10001.png' },
                modifyByOptions: undefined
            },
            { ...items[2], createByOptions: undefined, modifyByOptions: undefined }
        ]
    })
    // 操作人还原只发起一次批量调用，并使用服务间凭据而不是终端用户令牌。
    assert.deepEqual(accountFeignClient.calls, [{ authorization: 'Bearer service-token', input: { uids: ['10001', '10002'] } }])
})

test('品牌分页没有操作人时不调用账号服务', async () => {
    const queryBuilder = fakePageQueryBuilder([{ keyId: 1, name: '品牌一', createBy: undefined, modifyBy: undefined }], 1)
    const database = { builder: async (_repository, callback) => callback(queryBuilder) }
    const accountFeignClient = {
        calls: 0,
        async batchResolveUsers() {
            this.calls += 1
            return []
        }
    }
    const configService = { get: () => 'service-token' }
    const service = new BrandService({}, database, {}, accountFeignClient, configService)

    const result = await service.httpBaseFinanceColumnBrand({ page: 1, size: 10 })
    assert.equal(accountFeignClient.calls, 0)
    assert.deepEqual(result.list[0].createByOptions, undefined)
})

test('品牌分页组合账号信息失败时透传账号服务异常', async () => {
    const queryBuilder = fakePageQueryBuilder([{ keyId: 1, name: '品牌一', createBy: '10001', modifyBy: undefined }], 1)
    const database = { builder: async (_repository, callback) => callback(queryBuilder) }
    const accountFeignClient = {
        batchResolveUsers: async () => {
            throw new Error('账号服务异常')
        }
    }
    const configService = { get: () => 'service-token' }
    const service = new BrandService({}, database, {}, accountFeignClient, configService)

    await assert.rejects(() => service.httpBaseFinanceColumnBrand({ page: 1, size: 10 }), /账号服务异常/)
})

test('缺少服务间凭据时品牌分页拒绝调用账号服务', async () => {
    const queryBuilder = fakePageQueryBuilder([{ keyId: 1, name: '品牌一', createBy: '10001', modifyBy: undefined }], 1)
    const database = { builder: async (_repository, callback) => callback(queryBuilder) }
    const service = new BrandService({}, database, {}, { async batchResolveUsers() {} }, { get: () => undefined })

    await assert.rejects(() => service.httpBaseFinanceColumnBrand({ page: 1, size: 10 }), /feign\.service_token/)
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
    assert.match(sql, /`date`.*SELECT.*`date`/)
})

test('汇率日期重命名迁移兼容完整建表 SQL 已创建 date 列的数据库', async () => {
    assert.equal(RATE_DATE_RENAME_MIGRATION, '20260902090000__tb_finance_currency_exchange__rename_rate_date_to_date.sql')

    const legacy = fakeRateDateMigrationConnection(['rate_date'])
    assert.equal(await ensureCurrencyExchangeDateColumn(legacy), true)
    assert.equal(legacy.state.altered, true)

    const alreadyMigrated = fakeRateDateMigrationConnection(['date'])
    assert.equal(await ensureCurrencyExchangeDateColumn(alreadyMigrated), false)
    assert.equal(alreadyMigrated.state.altered, false)

    const inconsistent = fakeRateDateMigrationConnection(['rate_date', 'date'])
    await assert.rejects(() => ensureCurrencyExchangeDateColumn(inconsistent), /同时存在 rate_date 和 date 字段/)
})

test('Finance 演示数据使用固定种子并覆盖五张所属表', () => {
    const first = createFinanceDemoTables(20260822, '2026-08-22')
    const second = createFinanceDemoTables(20260822, '2026-08-22')
    assert.deepEqual(first, second)
    assert.deepEqual(
        first.map(table => table.table),
        ['tb_finance_brand', 'tb_finance_currency', 'tb_finance_currency_exchange', 'tb_finance_country', 'tb_finance_basic_sms_rate']
    )
    assert.deepEqual(first.find(table => table.table === 'tb_finance_currency_exchange').columns, ['currency', 'rate', 'date'])
    assert.equal(
        first.some(table => table.table.includes('client')),
        false
    )
    assert.equal(FINANCE_COMMON_CURRENCIES.length, 28)
    assert.deepEqual(
        FINANCE_COMMON_CURRENCIES.map(item => item.currency),
        [
            'USD',
            'EUR',
            'CNY',
            'JPY',
            'GBP',
            'CHF',
            'CAD',
            'AUD',
            'HKD',
            'SGD',
            'NZD',
            'INR',
            'BRL',
            'RUB',
            'KRW',
            'MXN',
            'ZAR',
            'AED',
            'SAR',
            'THB',
            'IDR',
            'MYR',
            'VND',
            'PHP',
            'PLN',
            'NOK',
            'SEK',
            'DKK'
        ]
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
        92
    )

    const applyConnection = fakeDemoSeedConnection()
    await seedFinanceDemoData(applyConnection, 'chat_web_finance', true)
    assert.equal(applyConnection.state.transactionStarted, true)
    assert.equal(applyConnection.state.inserts.length, 92)
    assert.equal(applyConnection.state.committed, true)
    assert.equal(applyConnection.state.rolledBack, false)
})

test('Finance 常用币种同步默认只预览，显式 --apply 才写入', async () => {
    assert.equal(shouldSyncFinanceCurrencies(['--sync-currencies']), true)
    assert.equal(shouldSyncFinanceCurrencies([]), false)

    const dryRunConnection = fakeDemoSeedConnection()
    const dryRunCount = await syncFinanceCurrencies(dryRunConnection, 'chat_web_finance', false)
    assert.equal(dryRunCount, 28)
    assert.equal(dryRunConnection.state.transactionStarted, false)
    assert.equal(dryRunConnection.state.inserts.length, 0)

    const applyConnection = fakeDemoSeedConnection()
    const applyCount = await syncFinanceCurrencies(applyConnection, 'chat_web_finance', true)
    assert.equal(applyCount, 28)
    assert.equal(applyConnection.state.transactionStarted, true)
    assert.equal(applyConnection.state.inserts.length, 28)
    assert.equal(applyConnection.state.committed, true)
    assert.equal(applyConnection.state.rolledBack, false)
})

test('Finance 国家地区主数据包含 137 条合法且唯一的区号 MCC 组合', () => {
    assert.equal(FINANCE_COUNTRY_DATA.length, 137)
    const uniqueKeys = new Set()
    for (const item of FINANCE_COUNTRY_DATA) {
        assert.match(item.code, /^\d{1,3}$/, `${item.cnName} 的国际区号格式错误`)
        assert.match(item.mcc, /^\d{3}$/, `${item.cnName} 的 MCC 格式错误`)
        uniqueKeys.add(`${item.code}:${item.mcc}`)
    }
    assert.equal(uniqueKeys.size, FINANCE_COUNTRY_DATA.length)
})

test('Finance 国家地区同步默认只预览，显式 --apply 才写入', async () => {
    assert.equal(shouldSyncFinanceCountries(['--sync-countries']), true)
    assert.equal(shouldSyncFinanceCountries([]), false)

    const dryRunConnection = fakeCountrySyncConnection()
    const dryRunCount = await syncFinanceCountries(dryRunConnection, 'chat_web_finance', false)
    assert.equal(dryRunCount, 137)
    assert.equal(dryRunConnection.state.transactions, 0)
    assert.equal(dryRunConnection.state.inserts.length, 0)
    assert.equal(dryRunConnection.state.rows.size, 0)

    const applyConnection = fakeCountrySyncConnection()
    const applyCount = await syncFinanceCountries(applyConnection, 'chat_web_finance', true)
    assert.equal(applyCount, 137)
    assert.equal(applyConnection.state.transactions, 1)
    assert.equal(applyConnection.state.inserts.length, 137)
    assert.equal(applyConnection.state.rows.size, 137)
    assert.equal(applyConnection.state.commits, 1)
    assert.equal(applyConnection.state.rollbacks, 0)
})

test('Finance 国家地区同步保持幂等且不覆盖人工禁用状态', async () => {
    const disabledCountry = { ...FINANCE_COUNTRY_DATA[0], keyId: 1000, code: `+${FINANCE_COUNTRY_DATA[0].code}`, status: 'disable' }
    const connection = fakeCountrySyncConnection([disabledCountry])

    await syncFinanceCountries(connection, 'chat_web_finance', true)
    await syncFinanceCountries(connection, 'chat_web_finance', true)

    assert.equal(connection.state.rows.size, FINANCE_COUNTRY_DATA.length)
    assert.equal(connection.state.rows.has(`${disabledCountry.code}:${disabledCountry.mcc}`), false)
    assert.equal(connection.state.rows.get(`${FINANCE_COUNTRY_DATA[0].code}:${disabledCountry.mcc}`).status, 'disable')
    assert.equal(connection.state.rows.get(`${FINANCE_COUNTRY_DATA[0].code}:${disabledCountry.mcc}`).keyId, 1000)
    assert.equal(connection.state.transactions, 2)
    assert.equal(connection.state.commits, 2)
    assert.equal(connection.state.rollbacks, 0)
})

test('Finance 国家区号转换发现新旧格式冲突时回滚', async () => {
    const country = FINANCE_COUNTRY_DATA[0]
    const connection = fakeCountrySyncConnection([
        { ...country, keyId: 1000, code: `+${country.code}`, status: 'disable' },
        { ...country, keyId: 2000, status: 'enable' }
    ])

    await assert.rejects(() => syncFinanceCountries(connection, 'chat_web_finance', true), /国家区号格式转换存在重复记录/)

    assert.equal(connection.state.rows.size, 2)
    assert.equal(connection.state.commits, 0)
    assert.equal(connection.state.rollbacks, 1)
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
        FINANCE_MYSQL_PASSWORD: 'redacted',
        FINANCE_SERVICE_TOKEN: 'redacted-token'
    })
    assert.match(financeConfig, /server:\n  port: 5030/)
    assert.match(financeConfig, /database:\n  chat-web-finance:/)
    assert.match(financeConfig, /name: "chat_web_finance"/)
    assert.match(financeConfig, /username: "finance-service"/)
    assert.match(financeConfig, /redis:\n  host: "chat-web-redis"\n  port: 6379\n  database: 3/)
    assert.match(financeConfig, /feign:\n  service_token: "redacted-token"/)
    assert.match(financeConfig, /chat-web-account/)
})

test('已有 Finance Nacos 配置只读校验并保留人工配置', () => {
    const sanitized = sanitizeFinanceConfig(`server:
  port: 5030
feign:
  service_token: finance-sync-secret
  chat-web-account:
    url: http://chat-web-account-service:5010
    timeout: 3000
  chat-web-crm:
    url: http://chat-web-crm-service:5020
    timeout: 3000
  chat-web-skyline:
    url: http://chat-web-skyline-service:5040
    timeout: 3000
database:
  chat-web-finance:
    host: mysql
    name: chat_web_finance
    username: finance-service
    password: redacted
redis:
  host: chat-web-redis
  port: 6379
  database: 1
`)
    assert.match(sanitized, /server:\n  port: 5030/)
    assert.match(sanitized, /feign:\n  service_token: finance-sync-secret/)
    assert.match(sanitized, /chat-web-crm|chat-web-skyline/)
    assert.match(sanitized, /redis:\n  host: chat-web-redis\n  port: 6379\n  database: 1/)
})

test('缺少 Feign 服务间凭据时拒绝配置', () => {
    assert.throws(
        () =>
            sanitizeFinanceConfig(`server:
  port: 5030
feign:
  chat-web-account:
    url: http://chat-web-account-service:5010
    timeout: 3000
  chat-web-crm:
    url: http://chat-web-crm-service:5020
    timeout: 3000
  chat-web-skyline:
    url: http://chat-web-skyline-service:5040
    timeout: 3000
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
  host: chat-web-redis
  port: 6379
  database: 1
`),
        /feign\.service_token/
    )
})

test('Nacos 返回 CRLF 时只规范换行且不改写配置', () => {
    const content = `server:
  port: 5030
feign:
  service_token: token
  chat-web-account:
    url: http://chat-web-account-service:5010
    timeout: 3000
  chat-web-crm:
    url: http://chat-web-crm-service:5020
    timeout: 3000
  chat-web-skyline:
    url: http://chat-web-skyline-service:5040
    timeout: 3000
database:
  chat-web-finance:
    host: mysql
    name: chat_web_finance
    username: finance-service
    password: redacted
redis:
  host: chat-web-redis
  port: 6379
  database: 1
`
    const crlfContent = content.replace(/\n/g, '\r\n')
    const sanitized = sanitizeFinanceConfig(crlfContent)
    assert.equal(sanitized, `${content.trim()}\n`)
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
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value
        },
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
    assert.equal(response.headers['x-request-id'], response.body.logId)
    assert.deepEqual(Object.keys(response.body), ['data', 'code', 'message', 'logId', 'timestamp'])
})
