import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService } from '@/modules/auth/auth.service'
import { IS_PUBLIC_ROUTE } from '@/modules/auth/auth.decorator'
import { AuthenticatedRequest } from '@/modules/auth/auth.interface'

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authService: AuthService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        const match = request.header('authorization')?.match(/^Bearer\s+([^\s]+)$/i)
        if (!match) throw new UnauthorizedException('缺少 Bearer 访问令牌')
        request.user = await this.authService.authenticateToken(match[1])
        return true
    }
}
