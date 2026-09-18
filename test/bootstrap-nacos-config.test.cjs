const test = require('node:test')
const assert = require('node:assert/strict')
const { createFinanceConfig, sanitizeFinanceConfig } = require('../deploy/bootstrap-nacos-config.cjs')

test('首次部署只使用显式 Finance 凭据生成 Nacos 数据库配置', () => {
    const financeConfig = createFinanceConfig({
        FINANCE_MYSQL_HOST: 'mysql',
        FINANCE_MYSQL_PORT: '3306',
        FINANCE_MYSQL_DATABASE: 'chat_web_finance',
        FINANCE_MYSQL_USERNAME: 'finance-service',
        FINANCE_MYSQL_PASSWORD: 'redacted',
        FINANCE_SERVICE_TOKEN: 'redacted-token',
        GATEWAY_PRINCIPAL_SECRET: '0123456789abcdef0123456789abcdef'
    })
    assert.match(financeConfig, /server:\n  port: 5030/)
    assert.match(financeConfig, /database:\n  chat-web-finance:/)
    assert.match(financeConfig, /name: "chat_web_finance"/)
    assert.match(financeConfig, /username: "finance-service"/)
    assert.match(financeConfig, /redis:\n  host: "chat-web-redis"\n  port: 6379\n  database: 3/)
    assert.match(financeConfig, /gateway:\n  feign:\n    service_token: "redacted-token"/)
    assert.match(financeConfig, /url: "http:\/\/chat-web-gateway-service:5000"/)
    assert.match(financeConfig, /timeout: 3000/)
    assert.match(financeConfig, /  principal:\n    secret: "0123456789abcdef0123456789abcdef"/)
    assert.match(financeConfig, /integration:\n  # 外部汇率数据源配置；汇率拉取与持久化均由 Finance 服务负责。\n  openExchangeRates:/)
    assert.doesNotMatch(financeConfig, /chat-web-crm:|chat-web-skyline:/)
})

test('已有 Finance Nacos 配置只读校验并保留人工配置', () => {
    const sanitized = sanitizeFinanceConfig(`server:
  port: 5030
gateway:
  feign:
    service_token: finance-sync-secret
    url: http://chat-web-gateway-service:5000
    timeout: 3000
  principal:
    secret: 0123456789abcdef0123456789abcdef
    maxAgeSeconds: 60
integration:
  openExchangeRates:
    appid: test-app-id
    timeout: 10000
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
    assert.match(sanitized, /gateway:\n  feign:\n    service_token: finance-sync-secret/)
    assert.match(sanitized, /url: http:\/\/chat-web-gateway-service:5000/)
    assert.match(sanitized, /redis:\n  host: chat-web-redis\n  port: 6379\n  database: 1/)
})

test('缺少 Feign 服务间凭据时拒绝配置', () => {
    assert.throws(
        () =>
            sanitizeFinanceConfig(`server:
  port: 5030
gateway:
  feign:
    url: http://chat-web-gateway-service:5000
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
        /gateway\.feign\.service_token/
    )
})

test('Nacos 返回 CRLF 时只规范换行且不改写配置', () => {
    const content = `server:
  port: 5030
gateway:
  feign:
    service_token: token
    url: http://chat-web-gateway-service:5000
    timeout: 3000
  principal:
    secret: 0123456789abcdef0123456789abcdef
    maxAgeSeconds: 60
integration:
  openExchangeRates:
    appid: test-app-id
    timeout: 10000
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
