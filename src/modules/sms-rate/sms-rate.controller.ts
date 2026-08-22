import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { BatchSmsRateDto, CreateSmsRateDto, ListSmsRateDto, UpdateSmsRateDto } from '@/modules/sms-rate/dto/sms-rate.dto'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'

@ApiTags('财务中心-短信基础价格')
@ApiBearerAuth('authorization')
@Controller('rates/sms')
export class SmsRateController {
    constructor(private readonly smsRateService: SmsRateService) {}
    @Post('create')
    httpBaseFinanceCreateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateSmsRateDto) {
        return this.smsRateService.create(principal.uid, input)
    }
    @Post('update')
    httpBaseFinanceUpdateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateSmsRateDto) {
        return this.smsRateService.update(principal.uid, input)
    }
    @Post('column')
    httpBaseFinanceColumnSmsRate(@Body() input: ListSmsRateDto) {
        return this.smsRateService.list(input)
    }
    @Post('batch')
    httpBaseFinanceBatchSmsRate(@Body() input: BatchSmsRateDto) {
        return this.smsRateService.batch(input)
    }
}
