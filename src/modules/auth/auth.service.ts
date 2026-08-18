import { Injectable } from '@nestjs/common'
import { AuthPrincipal } from '@/modules/auth/auth.interface'
import { AuthSessionService } from '@/modules/auth/auth-session.service'
import { TokenService } from '@/modules/auth/token.service'

@Injectable()
export class AuthService {
    constructor(
        private readonly tokenService: TokenService,
        private readonly sessionService: AuthSessionService
    ) {}

    async authenticateToken(token: string): Promise<AuthPrincipal> {
        const claims = this.tokenService.verifyAccessToken(token)
        await this.sessionService.assertActive(claims)
        return { uid: claims.sub, sessionId: claims.jti }
    }
}
