import { Module } from '@nestjs/common'
import { AUTH_TOKEN_AUTHENTICATOR, JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { ACCOUNT_AUTH_FETCH, AccountAuthClient } from '@/modules/auth/account-auth.client'

@Module({
    providers: [
        AccountAuthClient,
        JwtAuthGuard,
        { provide: ACCOUNT_AUTH_FETCH, useValue: fetch },
        { provide: AUTH_TOKEN_AUTHENTICATOR, useExisting: AccountAuthClient }
    ],
    exports: [AccountAuthClient, JwtAuthGuard]
})
export class AuthModule {}
