import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'

type FeignServiceConfig = Record<string, unknown>

type FeignServiceMapping = {
    name: string
    urlKey: string
    timeoutKey: string
}

const FEIGN_SERVICE_MAPPINGS: FeignServiceMapping[] = [
    { name: 'chat-web-account', urlKey: 'ACCOUNT_SERVICE_URL', timeoutKey: 'ACCOUNT_AUTH_TIMEOUT_MS' },
    { name: 'chat-web-finance', urlKey: 'FINANCE_SERVICE_URL', timeoutKey: 'FINANCE_SERVICE_TIMEOUT_MS' },
    { name: 'chat-web-crm', urlKey: 'CRM_SERVICE_URL', timeoutKey: 'CRM_SERVICE_TIMEOUT_MS' },
    { name: 'chat-web-skyline', urlKey: 'SKYLINE_SERVICE_URL', timeoutKey: 'SKYLINE_SERVICE_TIMEOUT_MS' }
]

const managedConfigKeys = new WeakMap<object, Set<string>>()
const managedEnvironmentValues = new Map<string, string>()

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasEnvironmentOverride(configService: ConfigService, key: string, environmentOverrides?: ReadonlySet<string>): boolean {
    if (environmentOverrides?.has(key)) return true
    const managedValue = managedEnvironmentValues.get(key)
    if (managedValue !== undefined && process.env[key] === managedValue) return false
    return Object.prototype.hasOwnProperty.call(process.env, key)
}

function resolveServiceConfig(feign: Record<string, unknown>, name: string): FeignServiceConfig | undefined {
    const value = feign[name]
    if (value === undefined || value === null) return undefined
    if (!isRecord(value)) throw new Error(`Nacos Feign 配置 feign.${name} 必须是 YAML 对象`)
    return value
}

function requireServiceField(service: FeignServiceConfig, name: string, field: 'url' | 'timeout'): unknown {
    const value = service[field]
    if (value === undefined || value === null) {
        throw new Error(`Nacos Feign 配置 feign.${name}.${field} 不能为空`)
    }
    return value
}

function validateUrl(name: string, value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Nacos Feign 配置 feign.${name}.url 必须是非空字符串`)
    const normalized = value.trim()
    let url: URL
    try {
        url = new URL(normalized)
    } catch {
        throw new Error(`Nacos Feign 配置 feign.${name}.url 格式无效`)
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Nacos Feign 配置 feign.${name}.url 必须使用 http:// 或 https://`)
    }
    return normalized
}

function validateTimeout(name: string, value: unknown): number {
    const timeout = Number(value)
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30_000) {
        throw new Error(`Nacos Feign 配置 feign.${name}.timeout 必须是 100-30000 之间的整数`)
    }
    return timeout
}

/** 将 Nacos 的嵌套 Feign 配置同步为共享 Feign 运行时的兼容键。 */
export function syncFeignConfiguration(configService: ConfigService, environmentOverrides?: ReadonlySet<string>): void {
    const previousKeys = managedConfigKeys.get(configService) ?? new Set<string>()
    const configured = configService.get<unknown>('feign')
    if (configured === undefined || configured === null) {
        previousKeys.forEach(key => {
            if (!hasEnvironmentOverride(configService, key, environmentOverrides)) {
                configService.set(key, undefined)
                delete process.env[key]
                managedEnvironmentValues.delete(key)
            }
        })
        managedConfigKeys.delete(configService)
        return
    }
    if (!isRecord(configured)) throw new Error('Nacos Feign 配置 feign 必须是 YAML 对象')

    const nextKeys = new Set<string>()
    for (const mapping of FEIGN_SERVICE_MAPPINGS) {
        const service = resolveServiceConfig(configured, mapping.name)
        if (!service) continue
        const url = validateUrl(mapping.name, requireServiceField(service, mapping.name, 'url'))
        const timeout = validateTimeout(mapping.name, requireServiceField(service, mapping.name, 'timeout'))
        if (!hasEnvironmentOverride(configService, mapping.urlKey, environmentOverrides)) {
            configService.set(mapping.urlKey, url)
            managedEnvironmentValues.set(mapping.urlKey, url)
            delete process.env[mapping.urlKey]
            nextKeys.add(mapping.urlKey)
        }
        if (!hasEnvironmentOverride(configService, mapping.timeoutKey, environmentOverrides)) {
            configService.set(mapping.timeoutKey, timeout)
            managedEnvironmentValues.set(mapping.timeoutKey, String(timeout))
            delete process.env[mapping.timeoutKey]
            nextKeys.add(mapping.timeoutKey)
        }
    }
    previousKeys.forEach(key => {
        if (!nextKeys.has(key) && !hasEnvironmentOverride(configService, key, environmentOverrides)) {
            configService.set(key, undefined)
            delete process.env[key]
            managedEnvironmentValues.delete(key)
        }
    })
    managedConfigKeys.set(configService, nextKeys)
}

/** 订阅 Nacos 配置变化，让 Feign 地址和超时在不重启时也保持同步。 */
@Global()
@Module({})
export class FeignConfigModule implements OnModuleInit, OnModuleDestroy {
    private unsubscribe?: () => void
    private readonly environmentOverrides = new Set<string>(
        ['feign', ...FEIGN_SERVICE_MAPPINGS.flatMap(mapping => [mapping.urlKey, mapping.timeoutKey])].filter(key =>
            Object.prototype.hasOwnProperty.call(process.env, key)
        )
    )

    constructor(
        private readonly configService: ConfigService,
        private readonly nacosService: NacosService
    ) {}

    public async onModuleInit(): Promise<void> {
        await this.nacosService.loadConfig()
        this.clearNacosEnvironmentArtifacts()
        syncFeignConfiguration(this.configService, this.environmentOverrides)
        if (!this.environmentOverrides.has('feign')) delete process.env.feign
        this.unsubscribe = this.nacosService.onConfigChange(() => {
            this.clearNacosEnvironmentArtifacts()
            syncFeignConfiguration(this.configService, this.environmentOverrides)
            if (!this.environmentOverrides.has('feign')) delete process.env.feign
        })
    }

    public onModuleDestroy(): void {
        this.unsubscribe?.()
    }

    private clearNacosEnvironmentArtifacts(): void {
        if (!this.environmentOverrides.has('feign')) delete process.env.feign
        for (const mapping of FEIGN_SERVICE_MAPPINGS) {
            if (!this.environmentOverrides.has(mapping.urlKey)) delete process.env[mapping.urlKey]
            if (!this.environmentOverrides.has(mapping.timeoutKey)) delete process.env[mapping.timeoutKey]
        }
    }
}
