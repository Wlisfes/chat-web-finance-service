import type { Request } from 'express'

export interface AuthPrincipal {
    uid: string
    sessionId: string
}

export type AuthenticatedRequest = Request & { user: AuthPrincipal }

export interface AccessTokenClaims {
    sub: string
    iss: string
    aud: string
    iat: number
    exp: number
    jti: string
}
