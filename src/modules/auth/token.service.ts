import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessTokenClaims } from '@/modules/auth/auth.interface'

type JwtHeader = { alg: string; typ: string }

@Injectable()
export class TokenService {
    constructor(private readonly configService: ConfigService) {}

    verifyAccessToken(token: string): AccessTokenClaims {
        if (!token || token.length > 4096) throw new UnauthorizedException('访问令牌无效')
        const parts = token.split('.')
        if (parts.length !== 3 || parts.some(part => !part)) throw new UnauthorizedException('访问令牌格式错误')
        const [encodedHeader, encodedClaims, encodedSignature] = parts
        const header = this.decodeJson<JwtHeader>(encodedHeader)
        const claims = this.decodeJson<AccessTokenClaims>(encodedClaims)
        if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new UnauthorizedException('访问令牌算法无效')
        const expected = Buffer.from(this.sign(`${encodedHeader}.${encodedClaims}`), 'base64url')
        const actual = Buffer.from(encodedSignature, 'base64url')
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            throw new UnauthorizedException('访问令牌签名无效')
        }
        const now = Math.floor(Date.now() / 1000)
        if (
            typeof claims.sub !== 'string' ||
            !/^\d{1,19}$/.test(claims.sub) ||
            claims.iss !== this.getIssuer() ||
            claims.aud !== this.getAudience() ||
            !Number.isInteger(claims.iat) ||
            !Number.isInteger(claims.exp) ||
            claims.exp <= now ||
            claims.iat > now + 60 ||
            typeof claims.jti !== 'string' ||
            !claims.jti
        ) {
            throw new UnauthorizedException('访问令牌声明无效或已过期')
        }
        return claims
    }

    private decodeJson<T>(value: string): T {
        try {
            return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
        } catch {
            throw new UnauthorizedException('访问令牌内容无效')
        }
    }

    private sign(value: string): string {
        return createHmac('sha256', this.getSecret()).update(value).digest('base64url')
    }

    private getSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET') || this.configService.get<string>('security.jwt.secret')
        if (typeof secret !== 'string' || secret.length < 32) throw new Error('JWT 密钥必须至少32位')
        return secret
    }

    private getIssuer(): string {
        return this.configService.get<string>('security.jwt.issuer')?.trim() || 'chat-web-account-service'
    }

    private getAudience(): string {
        return this.configService.get<string>('security.jwt.audience')?.trim() || 'chat-web'
    }
}
