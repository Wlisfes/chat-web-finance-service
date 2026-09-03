import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { FINANCE_SERVICE_TOKEN_ALLOWED } from '@/modules/auth/finance-auth.decorator'
import { Reflector } from '@nestjs/core'

/**
 * Finance 鉴权守卫。
 * 普通 Bearer 令牌继续交由 Account 远程鉴权；标记为服务间接口时，允许匹配 Nacos
 * `security.serviceToken` 或环境变量 `FINANCE_SERVICE_TOKEN` 的专用凭据。
 */
@Injectable()
export class FinanceAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
        private readonly jwtAuthGuard: JwtAuthGuard
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const allowsServiceToken = this.reflector.getAllAndOverride<boolean>(FINANCE_SERVICE_TOKEN_ALLOWED, [
            context.getHandler(),
            context.getClass()
        ])
        if (allowsServiceToken && this.matchesServiceToken(context.switchToHttp().getRequest<Request>())) {
            return true
        }
        return this.jwtAuthGuard.canActivate(context)
    }

    private matchesServiceToken(request: Request): boolean {
        const authorization = request.header('authorization')
        const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
        const configured = this.resolveServiceToken()
        if (!match || !configured) return false
        return this.secureEquals(match[1], configured)
    }

    private resolveServiceToken(): string | undefined {
        const configured = [
            this.configService.get<string>('FINANCE_SERVICE_TOKEN'),
            this.configService.get<string>('security.serviceToken')
        ].find(value => typeof value === 'string' && value.trim())
        if (!configured) return undefined
        return configured.trim().replace(/^Bearer\s+/i, '')
    }

    private secureEquals(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(left)
        const rightBuffer = Buffer.from(right)
        return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
    }
}
