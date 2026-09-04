'use strict'

/** Finance 部署前 Nacos 配置校验；只读，不创建、清理或回写人工配置。 */
function required(name, environment = process.env, trim = true) {
    const raw = environment[name]
    if (typeof raw !== 'string' || raw.length === 0 || (trim && !raw.trim())) throw new Error(`缺少环境变量：${name}`)
    return trim ? raw.trim() : raw
}

function getBaseUrl() {
    const server = required('NACOS_SERVER')
    return (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/$/, '')
}

async function getNacosAccessToken() {
    const username = process.env.NACOS_USERNAME?.trim()
    const password = process.env.NACOS_PASSWORD
    if (!username || password === undefined) return undefined
    const response = await fetch(`${getBaseUrl()}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    const result = await response.json()
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) throw new Error('Nacos 鉴权响应缺少 accessToken')
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
    if (!response.ok) throw new Error(`读取 Finance Nacos 配置失败：HTTP ${response.status}`)
    const content = await response.text()
    return content.trim() ? content : undefined
}

function normalizeContent(content) {
    return `${content.replace(/\r\n?/g, '\n').trim()}\n`
}

function scalar(value) {
    return JSON.stringify(value)
}

function createRedisConfig(environment = process.env) {
    const port = Number(environment.REDIS_PORT || 6379)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('REDIS_PORT 必须是 1-65535 之间的整数')
    const timeout = Number(environment.REDIS_CONNECT_TIMEOUT_MS || 5000)
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000)
        throw new Error('REDIS_CONNECT_TIMEOUT_MS 必须是 100-60000 之间的整数')
    const tls = environment.REDIS_TLS === undefined || environment.REDIS_TLS === '' ? false : environment.REDIS_TLS === 'true'
    if (environment.REDIS_TLS !== undefined && environment.REDIS_TLS !== '' && !['true', 'false'].includes(environment.REDIS_TLS))
        throw new Error('REDIS_TLS 必须是 true 或 false')
    const database = Number(environment.REDIS_DATABASE || 3)
    if (!Number.isInteger(database) || database < 0 || database > 15) throw new Error('REDIS_DATABASE 必须是 0-15 之间的整数')
    const lines = [
        'redis:',
        `  host: ${scalar(environment.REDIS_HOST?.trim() || 'chat-web-redis')}`,
        `  port: ${port}`,
        `  database: ${database}`,
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

function createFinanceConfig(environment = process.env) {
    const database = required('FINANCE_MYSQL_DATABASE', environment)
    if (database !== 'chat_web_finance') throw new Error('FINANCE_MYSQL_DATABASE 必须为 chat_web_finance')
    const port = Number(environment.FINANCE_MYSQL_PORT || 3306)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FINANCE_MYSQL_PORT 必须是 1-65535 之间的整数')
    const serviceToken = required('FINANCE_SERVICE_TOKEN', environment, false)
    return `server:
  port: 5030
feign:
  service_token: ${scalar(serviceToken)}
  chat-web-account:
    url: ${scalar(environment.ACCOUNT_SERVICE_URL || 'http://chat-web-account-service:5010')}
    timeout: ${Number(environment.ACCOUNT_AUTH_TIMEOUT_MS || 3000)}
  chat-web-crm:
    url: ${scalar(environment.CRM_SERVICE_URL || 'http://chat-web-crm-service:5020')}
    timeout: ${Number(environment.CRM_SERVICE_TIMEOUT_MS || 3000)}
  chat-web-skyline:
    url: ${scalar(environment.SKYLINE_SERVICE_URL || 'http://chat-web-skyline-service:5040')}
    timeout: ${Number(environment.SKYLINE_SERVICE_TIMEOUT_MS || 3000)}
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

function findServiceBlock(lines, name) {
    const start = lines.findIndex(line => line.trim() === `${name}:` && line.startsWith('  '))
    if (start < 0) return undefined
    const end = lines.findIndex((line, index) => index > start && line.trim() && !line.startsWith('    '))
    return { start, end: end < 0 ? lines.length : end }
}

function findRootChildValue(lines, rootName, childNames) {
    const root = lines.findIndex(line => line.trim() === `${rootName}:` && !line.startsWith(' '))
    if (root < 0) return undefined
    const end = lines.findIndex((line, index) => index > root && line.trim() && !line.startsWith(' '))
    const pattern = new RegExp(`^  (?:${childNames.join('|')}):\\s*(.*)$`)
    return lines
        .slice(root + 1, end < 0 ? lines.length : end)
        .find(line => pattern.test(line))
        ?.match(pattern)?.[1]
}

function validateFeignService(lines, name) {
    const block = findServiceBlock(lines, name)
    if (!block) throw new Error(`Finance Nacos 配置缺少 feign.${name}`)
    const scoped = lines.slice(block.start + 1, block.end)
    const urlLine = scoped.find(line => /^    url:\s*/.test(line))
    const timeoutLine = scoped.find(line => /^    timeout:\s*/.test(line))
    if (!urlLine || !urlLine.replace(/^    url:\s*/, '').trim()) throw new Error(`Finance Nacos 配置缺少 feign.${name}.url`)
    const url = urlLine
        .replace(/^    url:\s*/, '')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
    try {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch {
        throw new Error(`Finance Nacos 配置 feign.${name}.url 必须使用 http:// 或 https://`)
    }
    const timeout = timeoutLine?.replace(/^    timeout:\s*/, '').trim()
    if (!timeout || !/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 30_000)
        throw new Error(`Finance Nacos 配置 feign.${name}.timeout 必须是 100-30000 之间的整数`)
}

function validateFinanceConfig(content) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('Finance Nacos 配置不能为空')
    const normalized = normalizeContent(content)
    const lines = normalized.trimEnd().split('\n')
    if (!lines.some(line => line.trim() === 'server:') || !lines.some(line => /^  port:\s*5030\s*$/.test(line)))
        throw new Error('Finance Nacos 配置必须包含 server.port: 5030')
    if (!lines.some(line => line.trim() === 'database:') || !lines.some(line => line.trim() === 'chat-web-finance:'))
        throw new Error('Finance Nacos 配置必须包含 database.chat-web-finance')
    if (!lines.some(line => line.trim() === 'feign:')) throw new Error('Finance Nacos 配置必须包含 feign 节点')
    const token = findRootChildValue(lines, 'feign', ['service_token', 'serviceToken'])
    const legacyToken = findRootChildValue(lines, 'security', ['serviceToken'])
    if (!(token && token.trim()) && !(legacyToken && legacyToken.trim())) throw new Error('Finance Nacos 配置缺少 feign.service_token')
    for (const service of ['chat-web-account', 'chat-web-crm', 'chat-web-skyline']) validateFeignService(lines, service)
    return normalized
}

function sanitizeFinanceConfig(content) {
    return validateFinanceConfig(content)
}

async function main() {
    const dataId = required('NACOS_CONFIG_DATA_ID')
    const existing = await readConfig(dataId)
    if (!existing) throw new Error(`未找到 Finance Nacos 配置：${dataId}；请先在 Nacos 中完成人工配置`)
    const normalized = sanitizeFinanceConfig(existing)
    process.stdout.write(
        normalized === existing ? `Finance Nacos 配置校验通过且未修改：${dataId}\n` : `Finance Nacos 配置格式已规范化但未回写：${dataId}\n`
    )
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

module.exports = { createFinanceConfig, createRedisConfig, sanitizeFinanceConfig, validateFinanceConfig }
