import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import { AuthenticatedRequest, AuthPrincipal } from '@/modules/auth/auth.interface'

export const IS_PUBLIC_ROUTE = 'auth:is-public'
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true)

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): AuthPrincipal => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user
})
