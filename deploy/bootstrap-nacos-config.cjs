'use strict'

function required(name, environment = process.env, trim = true) {
    const raw = environment[name]
    if (typeof raw !== 'string' || raw.length === 0 || (trim && !raw.trim())) {
        throw new Error(`Missing environment variable: ${name}`)
    }
    return trim ? raw.trim() : raw
}

function getBaseUrl() {
    const server = required('NACOS_SERVER')
    return (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/$/, '')
}

async function getNacosAccessToken() {
    const baseUrl = getBaseUrl()
    const username = process.env.NACOS_USERNAME?.trim()
    const password = process.env.NACOS_PASSWORD
    if (!username || password === undefined) return undefined

    const response = await fetch(`${baseUrl}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    const result = await response.json()
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) {
        throw new Error('Nacos 鉴权响应缺少 accessToken')
    }
    return result.accessToken
}

async function configUrl(dataId) {
    const parameters = new URLSearchParams({
        dataId,
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
    const accessToken = await getNacosAccessToken()
    if (accessToken) parameters.set('accessToken', accessToken)
    return `${getBaseUrl()}/nacos/v1/cs/configs?${parameters}`
}

async function readConfig(dataId) {
    const response = await fetch(await configUrl(dataId))
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`Unable to read Nacos config ${dataId}: HTTP ${response.status}`)
    const content = await response.text()
    return content.trim() ? content : undefined
}

function createFinanceConfig(environment = process.env) {
    const database = required('FINANCE_MYSQL_DATABASE', environment)
    if (database !== 'chat_web_finance') {
        throw new Error('FINANCE_MYSQL_DATABASE must be chat_web_finance')
    }
    const port = Number(environment.FINANCE_MYSQL_PORT || 3306)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('FINANCE_MYSQL_PORT must be an integer between 1 and 65535')
    }
    const scalar = value => JSON.stringify(value)
    return `server:
  port: 5030
database:
  chat-web-finance:
    host: ${scalar(required('FINANCE_MYSQL_HOST', environment))}
    port: ${port}
    name: ${scalar(database)}
    username: ${scalar(required('FINANCE_MYSQL_USERNAME', environment))}
    password: ${scalar(required('FINANCE_MYSQL_PASSWORD', environment, false))}
    charset: ${scalar(environment.FINANCE_MYSQL_CHARSET?.trim() || 'utf8mb4')}
    timezone: ${scalar(environment.FINANCE_MYSQL_TIMEZONE?.trim() || '+08:00')}
${createRedisConfig(environment)}`
}

function createRedisConfig(environment = process.env) {
    const port = Number(environment.REDIS_PORT || 6379)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('REDIS_PORT must be an integer between 1 and 65535')
    }
    const timeout = Number(environment.REDIS_CONNECT_TIMEOUT_MS || 5000)
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000) {
        throw new Error('REDIS_CONNECT_TIMEOUT_MS must be an integer between 100 and 60000')
    }
    const tls = environment.REDIS_TLS === undefined || environment.REDIS_TLS === '' ? false : environment.REDIS_TLS === 'true'
    if (environment.REDIS_TLS !== undefined && environment.REDIS_TLS !== '' && !['true', 'false'].includes(environment.REDIS_TLS)) {
        throw new Error('REDIS_TLS must be true or false')
    }
    const scalar = value => JSON.stringify(value)
    const lines = [
        'redis:',
        `  host: ${scalar(environment.REDIS_HOST?.trim() || 'chat-web-redis')}`,
        `  port: ${port}`,
        '  database: 1',
        `  tls: ${tls}`,
        `  connectTimeoutMs: ${timeout}`
    ]
    for (const [key, name] of [
        ['REDIS_URL', 'url'],
        ['REDIS_USERNAME', 'username'],
        ['REDIS_PASSWORD', 'password']
    ]) {
        if (environment[key] !== undefined && environment[key] !== '') lines.push(`  ${name}: ${scalar(environment[key])}`)
    }
    return `${lines.join('\n')}\n`
}

function sanitizeFinanceConfig(content, environment = process.env) {
    const lines = []
    let block = []
    let blockRoot
    const flushBlock = () => {
        if (!block.length) return
        if (blockRoot !== 'security') {
            lines.push(...block)
            block = []
            blockRoot = undefined
            return
        }

        const rootIndex = block.findIndex(line => /^security:(?:\s.*)?$/.test(line))
        const tokenPattern = /^(\s+)serviceToken\s*:\s*(\S.*)$/
        const childIndentations = block
            .slice(rootIndex + 1)
            .filter(line => line.trim() && !line.trim().startsWith('#'))
            .map(line => line.match(/^\s*/)?.[0].length ?? 0)
            .filter(indent => indent > 0)
        const childIndent = childIndentations.length ? Math.min(...childIndentations) : 0
        const tokenIndex = block.findIndex((line, index) => {
            const match = line.match(tokenPattern)
            return index > rootIndex && Boolean(match) && (childIndent === 0 || match?.[1].length === childIndent)
        })
        if (rootIndex < 0 || tokenIndex < 0) {
            block = []
            blockRoot = undefined
            return
        }

        const tokenMatch = block[tokenIndex].match(tokenPattern)
        if (!tokenMatch) {
            block = []
            blockRoot = undefined
            return
        }

        lines.push(...block.slice(0, rootIndex + 1), block[tokenIndex])
        // 仅在明确使用 YAML block scalar 时保留 serviceToken 的续行，其他 security 子项全部丢弃。
        if (/^[|>][-+0-9]*$/.test(tokenMatch[2].trim())) {
            for (let index = tokenIndex + 1; index < block.length; index += 1) {
                const line = block[index]
                const indentation = line.match(/^\s*/)?.[0].length ?? 0
                if (!line.trim() || indentation > tokenMatch[1].length) {
                    lines.push(line)
                    continue
                }
                break
            }
        }
        block = []
        blockRoot = undefined
    }

    for (const originalLine of content.split(/\r?\n/)) {
        const root = originalLine.match(/^([A-Za-z0-9_-]+):(?:\s.*)?$/)?.[1]
        if (root && blockRoot !== undefined) flushBlock()
        if (root) blockRoot = root
        const line =
            blockRoot === 'server' && /^\s+port:\s*/.test(originalLine)
                ? originalLine.replace(/^(\s*)port:.*$/, '$1port: 5030')
                : originalLine
        block.push(line)
    }
    flushBlock()
    let sanitized = lines.join('\n').trim()

    if (!/^server:\s*$/m.test(sanitized) || !/^database:\s*$/m.test(sanitized) || !/^\s+chat-web-finance:\s*$/m.test(sanitized)) {
        throw new Error('Existing Finance Nacos config must contain server and database.chat-web-finance')
    }
    if (/chat-web-account/.test(sanitized)) {
        throw new Error('Existing Finance Nacos config still references chat-web-account')
    }
    const configLines = sanitized.split('\n')
    const redisStart = configLines.findIndex(line => /^redis:\s*$/.test(line))
    if (redisStart >= 0) {
        const redisEnd = configLines.findIndex((line, index) => index > redisStart && /^[A-Za-z0-9_-]+:/.test(line))
        const redisBlock = configLines.slice(redisStart, redisEnd >= 0 ? redisEnd : configLines.length)
        if (!redisBlock.some(line => /^\s+database:\s*1\s*$/.test(line))) {
            throw new Error('Existing Finance Nacos redis.database must be 1')
        }
    } else {
        sanitized = `${sanitized}\n${createRedisConfig(environment).trim()}`
    }
    return `${sanitized}\n`
}

async function publishConfig(dataId, content) {
    const body = new URLSearchParams({
        dataId,
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public',
        type: 'yaml',
        content
    })
    const accessToken = await getNacosAccessToken()
    if (accessToken) body.set('accessToken', accessToken)
    const response = await fetch(`${getBaseUrl()}/nacos/v1/cs/configs`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
    })
    const result = await response.text()
    if (!response.ok || result.trim() !== 'true') {
        throw new Error(`Unable to publish Nacos config ${dataId}: HTTP ${response.status}`)
    }
}

async function main() {
    const financeDataId = required('NACOS_CONFIG_DATA_ID')
    const existingConfig = await readConfig(financeDataId)
    if (existingConfig) {
        const sanitized = sanitizeFinanceConfig(existingConfig)
        // Nacos 可能按 CRLF 返回历史配置；统一换行后比较，避免每次部署重复发布同一份配置。
        const normalizedExisting = `${existingConfig.replace(/\r\n?/g, '\n').trim()}\n`
        if (sanitized !== normalizedExisting) {
            await publishConfig(financeDataId, sanitized)
            process.stdout.write(`Nacos config sanitized: ${financeDataId}\n`)
            return
        }
        process.stdout.write(`Nacos config already isolated: ${financeDataId}\n`)
        return
    }

    await publishConfig(financeDataId, createFinanceConfig())
    process.stdout.write(`Nacos config created: ${financeDataId}\n`)
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

module.exports = { createFinanceConfig, createRedisConfig, sanitizeFinanceConfig }
