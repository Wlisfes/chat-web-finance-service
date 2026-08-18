import { networkInterfaces } from 'node:os'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NacosService as NestNacosService } from '@sch_cat/nest-nacos-config'
import { NacosNamingClient } from 'nacos'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml')

type RegisteredInstance = { ip: string; port: number }
type ClosableNacosNamingClient = NacosNamingClient & { close: () => Promise<void> }

@Injectable()
export class NacosService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NacosService.name)
    private readonly remoteConfigKeys = new Set<string>()
    private currentContent: string | null = null
    private loadPromise: Promise<void> | null = null
    private subscribed = false
    private namingClient?: ClosableNacosNamingClient
    private registeredInstance?: RegisteredInstance

    constructor(
        private readonly configService: ConfigService,
        private readonly nestNacosService: NestNacosService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.loadConfig()
        await this.registerService()
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.namingClient) return
        if (this.registeredInstance) {
            try {
                await this.namingClient.deregisterInstance(
                    this.getServiceName(),
                    { instanceId: '', healthy: true, enabled: true, ephemeral: true, ...this.registeredInstance },
                    this.getGroup()
                )
            } catch (error) {
                this.logger.warn(`注销 Nacos 服务实例失败：${this.message(error)}`)
            }
        }
        await this.namingClient.close()
    }

    async loadConfig(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.initializeConfig().catch(error => {
                this.loadPromise = null
                throw error
            })
        }
        await this.loadPromise
    }

    private async initializeConfig(): Promise<void> {
        const dataId = this.required('NACOS_CONFIG_DATA_ID')
        const group = this.configService.get<string>('NACOS_CONFIG_GROUP') || this.required('NACOS_GROUP')
        const content = await this.nestNacosService.getConfig(dataId, group)
        this.applyRemoteConfig(content, dataId, group)
        if (!this.subscribed) {
            this.nestNacosService.subscribeConfig(dataId, group, next => {
                try {
                    this.applyRemoteConfig(next, dataId, group)
                } catch (error) {
                    this.logger.error(`无效的 Nacos 配置更新已拒绝：${this.message(error)}`)
                }
            })
            this.subscribed = true
        }
    }

    private applyRemoteConfig(content: string, dataId: string, group: string): void {
        if (!content?.trim()) throw new Error(`Nacos 配置为空或不存在：dataId=${dataId}, group=${group}`)
        if (content === this.currentContent) return
        const parsed = yaml.load(content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Nacos 配置根节点必须是 YAML 对象')
        const config = parsed as Record<string, unknown>
        for (const key of this.remoteConfigKeys) if (!(key in config)) this.configService.set(key, undefined)
        this.remoteConfigKeys.clear()
        for (const [key, value] of Object.entries(config)) {
            if (Object.prototype.hasOwnProperty.call(process.env, key)) continue
            this.configService.set(key, value)
            this.remoteConfigKeys.add(key)
        }
        this.currentContent = content
        this.logger.log(`Nacos 配置已加载：dataId=${dataId}, group=${group}`)
    }

    private async registerService(): Promise<void> {
        if (!this.boolean('NACOS_REGISTER_ENABLED', true)) {
            this.logger.warn('Nacos 服务注册已关闭')
            return
        }
        try {
            this.namingClient = new NacosNamingClient({
                logger: this.createClientLogger(),
                serverList: this.configService.get<string>('NACOS_SERVER', '127.0.0.1:8848'),
                namespace: this.configService.get<string>('NACOS_NAMESPACE', 'public'),
                username: this.configService.get<string>('NACOS_USERNAME') || undefined,
                password: this.configService.get<string>('NACOS_PASSWORD') || undefined
            }) as ClosableNacosNamingClient
            await this.namingClient.ready()
            const instance = { ip: this.resolveIp(), port: this.getPort() }
            await this.namingClient.registerInstance(
                this.getServiceName(),
                { instanceId: '', healthy: true, enabled: true, ephemeral: true, ...instance },
                this.getGroup()
            )
            this.registeredInstance = instance
            this.logger.log(`服务已注册到 Nacos：${this.getServiceName()} ${instance.ip}:${instance.port}`)
        } catch (error) {
            this.logger.error(`注册 Nacos 服务实例失败：${this.message(error)}`)
            if (this.boolean('NACOS_REGISTER_REQUIRED', false)) throw error
        }
    }

    private resolveIp(): string {
        const configured = this.configService.get<string>('NACOS_REGISTER_IP')?.trim()
        if (configured) return configured
        for (const addresses of Object.values(networkInterfaces())) {
            const address = addresses?.find(item => item.family === 'IPv4' && !item.internal)
            if (address) return address.address
        }
        return '127.0.0.1'
    }

    private getPort(): number {
        const port = Number(this.configService.get<string | number>('NACOS_REGISTER_PORT') ?? this.configService.get('server.port', 3010))
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('NACOS_REGISTER_PORT 格式错误')
        return port
    }

    private getServiceName(): string {
        return this.configService.get<string>('NACOS_SERVICE_NAME')?.trim() || 'chat-web-finance-service'
    }

    private getGroup(): string {
        return (
            this.configService.get<string>('NACOS_GROUP') ||
            this.configService.get<string>('NACOS_CONFIG_GROUP') ||
            'DEFAULT_GROUP'
        ).trim()
    }

    private required(key: string): string {
        const value = this.configService.get<string>(key)?.trim()
        if (!value) throw new Error(`缺少环境变量：${key}`)
        return value
    }

    private boolean(key: string, fallback: boolean): boolean {
        const value = this.configService.get<boolean | string>(key)
        if (value === undefined || value === null || value === '') return fallback
        if (typeof value === 'boolean') return value
        if (value === 'true' || value === 'false') return value === 'true'
        throw new Error(`${key} 必须是 true 或 false`)
    }

    private createClientLogger(): typeof console {
        const logger = Object.create(console) as typeof console
        logger.log = () => undefined
        logger.info = () => undefined
        logger.debug = () => undefined
        return logger
    }

    private message(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
