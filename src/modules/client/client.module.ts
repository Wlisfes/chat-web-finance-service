import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbFinanceBrand, TbFinanceClient, TbFinanceCurrency } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { ClientController } from '@/modules/client/client.controller'
import { ClientService } from '@/modules/client/client.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbFinanceClient, TbFinanceBrand, TbFinanceCurrency])],
    controllers: [ClientController],
    providers: [ClientService]
})
export class ClientModule {}
