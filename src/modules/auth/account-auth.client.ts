import { BadGatewayException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AuthPrincipal, AuthTokenAuthenticator } from '@wlisfes/chat-web-base-schema/auth'

export const ACCOUNT_AUTH_FETCH = Symbol('ACCOUNT_AUTH_FETCH')

type FetchClient = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type ApiEnvelope = {
    data?: unknown
    code?: unknown
    message?: unknown
}

@Injectable()
export class AccountAuthClient implements AuthTokenAuthenticator {
    private readonly introspectionUrl: string
    private readonly timeoutMs: number

    constructor(
        configService: ConfigService,
        @Inject(ACCOUNT_AUTH_FETCH) private readonly fetchClient: FetchClient
    ) {
        const baseUrl = configService.get<string>('ACCOUNT_SERVICE_URL')?.trim() || 'http://chat-web-account-service:3000'
        let parsed: URL
        try {
            parsed = new URL(baseUrl)
        } catch {
            throw new Error('ACCOUNT_SERVICE_URL 格式无效')
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('ACCOUNT_SERVICE_URL 必须使用 http:// 或 https://')
        }
        this.introspectionUrl = new URL('/auth/token/introspect', parsed).toString()
        this.timeoutMs = this.getTimeout(configService.get<string | number>('ACCOUNT_AUTH_TIMEOUT_MS'))
    }

    async authenticateToken(token: string): Promise<AuthPrincipal> {
        let response: Response
        try {
            response = await this.fetchClient(this.introspectionUrl, {
                method: 'GET',
                headers: { accept: 'application/json', authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(this.timeoutMs)
            })
        } catch {
            throw new ServiceUnavailableException('账号鉴权服务暂不可用')
        }

        let envelope: ApiEnvelope
        try {
            envelope = (await response.json()) as ApiEnvelope
        } catch {
            throw new BadGatewayException('账号鉴权服务返回了无效响应')
        }

        const code = typeof envelope.code === 'number' ? envelope.code : response.status
        const message = typeof envelope.message === 'string' && envelope.message.trim() ? envelope.message : '访问令牌无效'
        if (response.status === 401 || response.status === 403 || code === 401 || code === 403) {
            throw new UnauthorizedException(message)
        }
        if (!response.ok || code !== 200) {
            throw new BadGatewayException('账号鉴权服务返回异常')
        }
        if (!this.isPrincipal(envelope.data)) {
            throw new BadGatewayException('账号鉴权服务返回了无效身份主体')
        }
        return envelope.data
    }

    private isPrincipal(value: unknown): value is AuthPrincipal {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        const principal = value as Partial<AuthPrincipal>
        return (
            typeof principal.uid === 'string' &&
            principal.uid.length > 0 &&
            typeof principal.sessionId === 'string' &&
            principal.sessionId.length > 0
        )
    }

    private getTimeout(configured: string | number | undefined): number {
        const value = configured === undefined || configured === '' ? 3000 : Number(configured)
        if (!Number.isInteger(value) || value < 100 || value > 30_000) {
            throw new Error('ACCOUNT_AUTH_TIMEOUT_MS 必须是 100-30000 之间的整数')
        }
        return value
    }
}
