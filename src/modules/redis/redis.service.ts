import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from 'redis'

@Injectable()
export class RedisService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(RedisService.name)
    private readonly client: ReturnType<typeof createClient>

    constructor(private readonly configService: ConfigService) {
        const url = this.getConnectionUrl()
        const parsed = new URL(url)
        this.logger.log(`Redis配置已解析：authenticated=${Boolean(parsed.password)}, tls=${parsed.protocol === 'rediss:'}`)
        this.client = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: retries => Math.min(retries * 200, 3000) } })
        this.client.on('error', error => this.logger.error(`Redis连接错误：${error instanceof Error ? error.message : String(error)}`))
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.client.connect()
        await this.client.ping()
    }

    async onApplicationShutdown(): Promise<void> {
        if (this.client.isOpen) await this.client.quit()
    }

    async ping(): Promise<boolean> {
        return this.client.isReady && (await this.client.ping()) === 'PONG'
    }

    async get(key: string): Promise<string | null> {
        const value = await this.client.get(key)
        return Buffer.isBuffer(value) ? value.toString('utf8') : value
    }

    private getConnectionUrl(): string {
        const configured = this.configService.get<string>('REDIS_URL')?.trim()
        if (configured) {
            const url = new URL(configured)
            if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL 协议无效')
            if (!url.password && this.configService.get<string>('REDIS_PASSWORD')) {
                url.username = this.configService.get<string>('REDIS_USERNAME')?.trim() || ''
                url.password = this.configService.get<string>('REDIS_PASSWORD')!
            }
            return url.toString()
        }
        const host = this.configService.get<string>('REDIS_HOST')?.trim() || 'chat-web-redis'
        const port = Number(this.configService.get<string | number>('REDIS_PORT', 6379))
        const database = Number(this.configService.get<string | number>('REDIS_DATABASE', 0))
        const username = this.configService.get<string>('REDIS_USERNAME')?.trim()
        const password = this.configService.get<string>('REDIS_PASSWORD')
        const credentials = password
            ? `${username ? encodeURIComponent(username) : ''}:${encodeURIComponent(password)}@`
            : username
              ? `${encodeURIComponent(username)}@`
              : ''
        return `${this.configService.get<string>('REDIS_TLS') === 'true' ? 'rediss' : 'redis'}://${credentials}${host}:${port}/${database}`
    }
}
