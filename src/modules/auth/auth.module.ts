import { Module } from '@nestjs/common'
import { AuthService } from '@/modules/auth/auth.service'
import { AuthSessionService } from '@/modules/auth/auth-session.service'
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard'
import { TokenService } from '@/modules/auth/token.service'

@Module({
    providers: [AuthService, AuthSessionService, JwtAuthGuard, TokenService],
    exports: [JwtAuthGuard]
})
export class AuthModule {}
