import { Module } from '@nestjs/common'
import { CrmUserService } from '@/modules/crm/user/user.service'

/** 客户钱包：创建、查询，并为已有钱包补齐 Redis 缓存。扣费不在本模块处理。 */
@Module({
    providers: [CrmUserService],
    exports: [CrmUserService]
})
export class CrmModule {}
