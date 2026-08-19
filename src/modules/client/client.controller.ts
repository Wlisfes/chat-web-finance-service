import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ClientService } from '@/modules/client/client.service'
import { CreateClientDto, ListClientDto, UpdateClientDto, UpdateClientStatusDto } from '@/modules/client/dto/client.dto'

@ApiTags('财务中心-消费用户')
@ApiBearerAuth('authorization')
@Controller('client')
export class ClientController {
    constructor(private readonly service: ClientService) {}
    @Post('create')
    create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateClientDto) {
        return this.service.create(principal.uid, input)
    }
    @Post('update')
    update(@Body() input: UpdateClientDto) {
        return this.service.update(input)
    }
    @Post('column')
    list(@Body() input: ListClientDto) {
        return this.service.list(input)
    }
    @Post('update/status')
    updateStatus(@Body() input: UpdateClientStatusDto) {
        return this.service.updateStatus(input)
    }
}
