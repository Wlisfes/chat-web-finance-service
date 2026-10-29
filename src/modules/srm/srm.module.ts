import { Module } from '@nestjs/common'
import { SrmUserService } from '@/modules/srm/user/user.service'

/** 供应商钱包：创建、查询，并为新旧钱包补齐 Redis 缓存。扣费不在本模块处理。 */
@Module({
    providers: [SrmUserService],
    exports: [SrmUserService]
})
export class SrmModule {}
