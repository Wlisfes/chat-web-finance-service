import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceBrand } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { BrandController } from '@/modules/brand/brand.controller'
import { BrandService } from '@/modules/brand/brand.service'

@Module({ imports: [TypeOrmModule.forFeature([TbFinanceBrand])], controllers: [BrandController], providers: [BrandService] })
export class BrandModule {}
