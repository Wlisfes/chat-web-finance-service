'use strict'

function required(name) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`Missing environment variable: ${name}`)
    return value
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

function createFinanceConfig(accountConfig) {
    let section = ''
    const content = accountConfig
        .split(/\r?\n/)
        .map(line => {
            const root = line.match(/^([A-Za-z0-9_-]+):\s*$/)
            if (root) section = root[1]
            if (section === 'server' && /^\s+port:\s*/.test(line)) return line.replace(/^(\s*)port:.*$/, '$1port: 3010')
            if (section === 'database') return line.replaceAll('chat-web-account', 'chat-web-finance')
            return line
        })
        .join('\n')
        .trim()

    if (!/^database:\s*$/m.test(content) || !/^\s+chat-web-finance:\s*$/m.test(content)) {
        throw new Error('Account Nacos config does not contain database.chat-web-account')
    }
    return `${content}\n`
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
    if (await readConfig(financeDataId)) {
        process.stdout.write(`Nacos config already exists: ${financeDataId}\n`)
        return
    }

    const accountDataId = process.env.ACCOUNT_NACOS_CONFIG_DATA_ID?.trim() || 'chat-web-account-service.yaml'
    const accountConfig = await readConfig(accountDataId)
    if (!accountConfig) throw new Error(`Account Nacos config does not exist: ${accountDataId}`)
    await publishConfig(financeDataId, createFinanceConfig(accountConfig))
    process.stdout.write(`Nacos config created: ${financeDataId}\n`)
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

module.exports = { createFinanceConfig }
