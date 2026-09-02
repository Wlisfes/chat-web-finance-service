import { SetMetadata } from '@nestjs/common'

/** 允许使用 Finance 服务间凭据访问指定接口。 */
export const FINANCE_SERVICE_TOKEN_ALLOWED = 'finance:service-token-allowed'

export const AllowFinanceServiceToken = () => SetMetadata(FINANCE_SERVICE_TOKEN_ALLOWED, true)
