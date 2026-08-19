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

function configUrl(dataId) {
    const parameters = new URLSearchParams({
        dataId,
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
    return `${getBaseUrl()}/nacos/v1/cs/configs?${parameters}`
}

async function readConfig(dataId) {
    const response = await fetch(configUrl(dataId))
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
  port: 3010
database:
  chat-web-finance:
    host: ${scalar(required('FINANCE_MYSQL_HOST', environment))}
    port: ${port}
    name: ${scalar(database)}
    username: ${scalar(required('FINANCE_MYSQL_USERNAME', environment))}
    password: ${scalar(required('FINANCE_MYSQL_PASSWORD', environment, false))}
    charset: ${scalar(environment.FINANCE_MYSQL_CHARSET?.trim() || 'utf8mb4')}
    timezone: ${scalar(environment.FINANCE_MYSQL_TIMEZONE?.trim() || '+08:00')}
`
}

function sanitizeFinanceConfig(content) {
    const forbiddenSections = new Set(['security', 'redis'])
    let section = ''
    const lines = []
    for (const originalLine of content.split(/\r?\n/)) {
        const root = originalLine.match(/^([A-Za-z0-9_-]+):(?:\s.*)?$/)
        if (root) section = root[1]
        if (forbiddenSections.has(section)) continue
        const line =
            section === 'server' && /^\s+port:\s*/.test(originalLine)
                ? originalLine.replace(/^(\s*)port:.*$/, '$1port: 3010')
                : originalLine
        lines.push(line)
    }
    const sanitized = lines.join('\n').trim()

    if (!/^server:\s*$/m.test(sanitized) || !/^database:\s*$/m.test(sanitized) || !/^\s+chat-web-finance:\s*$/m.test(sanitized)) {
        throw new Error('Existing Finance Nacos config must contain server and database.chat-web-finance')
    }
    if (/chat-web-account/.test(sanitized)) {
        throw new Error('Existing Finance Nacos config still references chat-web-account')
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
        if (sanitized !== `${existingConfig.trim()}\n`) {
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

module.exports = { createFinanceConfig, sanitizeFinanceConfig }
