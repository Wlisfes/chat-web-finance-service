import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeignClientAccountManager, FeignClientCrmManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { TbFinanceBrand } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { BrandController } from '@/modules/brand/brand.controller'
import { BrandService } from '@/modules/brand/brand.service'
import { BrandUtilsService } from '@/modules/brand/brand.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceBrand]), FeignModule.register([FeignClientAccountManager, FeignClientCrmManager])],
    controllers: [BrandController],
    providers: [BrandService, BrandUtilsService],
    exports: [BrandUtilsService]
})
export class BrandModule {}
