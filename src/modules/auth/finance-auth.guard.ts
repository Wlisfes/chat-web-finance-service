import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GatewayPrincipalGuard } from '@wlisfes/chat-web-base-schema/auth'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { FINANCE_SERVICE_TOKEN_ALLOWED } from '@/modules/auth/finance-auth.decorator'
import { Reflector } from '@nestjs/core'

/**
 * Finance 鉴权守卫。
 * 普通请求校验网关签发的身份上下文；标记为服务间接口时，允许匹配 Nacos
 * `feign.service_token` 的专用凭据。用户令牌与服务凭据始终分离。
 */
@Injectable()
export class FinanceAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
        private readonly gatewayPrincipalGuard: GatewayPrincipalGuard
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const allowsServiceToken = this.reflector.getAllAndOverride<boolean>(FINANCE_SERVICE_TOKEN_ALLOWED, [
            context.getHandler(),
            context.getClass()
        ])
        if (allowsServiceToken && this.matchesServiceToken(context.switchToHttp().getRequest<Request>())) {
            return true
        }
        return this.gatewayPrincipalGuard.canActivate(context)
    }

    private matchesServiceToken(request: Request): boolean {
        const authorization = request.header('authorization')
        const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
        const configured = this.resolveServiceToken()
        if (!match || !configured) return false
        return this.secureEquals(match[1], configured)
    }

    private resolveServiceToken(): string | undefined {
        const configured = this.configService.get<string>('feign.service_token')
        if (typeof configured !== 'string' || !configured.trim()) return undefined
        return configured.trim().replace(/^Bearer\s+/i, '')
    }

    private secureEquals(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(left)
        const rightBuffer = Buffer.from(right)
        return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
    }
}
