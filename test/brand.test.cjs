const test = require('node:test')
const assert = require('node:assert/strict')
const { BrandService } = require('../dist/modules/brand/brand.service')

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
    const configService = { get: key => (key === 'gateway.feign.service_token' ? 'service-token' : undefined) }
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
