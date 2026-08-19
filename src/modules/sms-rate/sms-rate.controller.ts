import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { CreateSmsRateDto, ListSmsRateDto, UpdateSmsRateDto } from '@/modules/sms-rate/dto/sms-rate.dto'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'

@ApiTags('财务中心-短信基础价格')
@ApiBearerAuth('authorization')
@Controller('rates/sms')
export class SmsRateController {
    constructor(private readonly service: SmsRateService) {}
    @Post('create')
    create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateSmsRateDto) {
        return this.service.create(principal.uid, input)
    }
    @Post('update')
    update(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateSmsRateDto) {
        return this.service.update(principal.uid, input)
    }
    @Post('column')
    list(@Body() input: ListSmsRateDto) {
        return this.service.list(input)
    }
}
