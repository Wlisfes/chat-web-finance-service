import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessTokenClaims } from '@/modules/auth/auth.interface'
import { RedisService } from '@/modules/redis/redis.service'

@Injectable()
export class AuthSessionService {
    private readonly prefix: string

    constructor(
        private readonly redisService: RedisService,
        configService: ConfigService
    ) {
        this.prefix = configService.get<string>('AUTH_SESSION_PREFIX')?.trim() || 'chat-web:account:session'
    }

    async assertActive(claims: AccessTokenClaims): Promise<void> {
        if ((await this.redisService.get(`${this.prefix}:${claims.jti}`)) !== claims.sub) {
            throw new UnauthorizedException('登录会话已失效，请重新登录')
        }
    }
}
