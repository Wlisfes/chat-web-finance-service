import { Body, Post } from '@nestjs/common'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'
import { BatchSmsRateResponseDto, SmsRatePageResponseDto } from '@/dto/api-response.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as SmsRateDto from '@/modules/sms-rate/dto/sms-rate.dto'

@ApifoxController('财务中心-短信基础价格', 'rates/sms', { bearerAuth: true })
export class SmsRateController {
    constructor(private readonly smsRateService: SmsRateService) {}

    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增短信基础价格' },
        request: { source: 'body', type: SmsRateDto.CreateSmsRateDto },
        response: { type: Schema.TbFinanceBasicSmsRateDto, description: '新增后的短信基础价格' }
    })
    public async httpBaseFinanceCreateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: SmsRateDto.CreateSmsRateDto) {
        return this.smsRateService.httpBaseFinanceCreateSmsRate(principal, input)
    }
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新短信基础价格' },
        request: { source: 'body', type: SmsRateDto.UpdateSmsRateDto },
        response: { type: Schema.TbFinanceBasicSmsRateDto, description: '更新后的短信基础价格' }
    })
    public async httpBaseFinanceUpdateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: SmsRateDto.UpdateSmsRateDto) {
        return this.smsRateService.httpBaseFinanceUpdateSmsRate(principal, input)
    }
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询短信基础价格' },
        request: { source: 'body', type: SmsRateDto.ListSmsRateDto },
        response: { type: SmsRatePageResponseDto, description: '短信基础价格分页数据' }
    })
    public async httpBaseFinanceColumnSmsRate(@Body() input: SmsRateDto.ListSmsRateDto) {
        return this.smsRateService.httpBaseFinanceColumnSmsRate(input)
    }
    @ApiServiceDecorator(Post('batch'), {
        operation: { summary: '按国家地区批量查询短信基础价格' },
        request: { source: 'body', type: SmsRateDto.BatchSmsRateDto },
        response: { type: BatchSmsRateResponseDto, isArray: true, description: '国家地区短信基础价格列表' }
    })
    public async httpBaseFinanceBatchSmsRate(@Body() input: SmsRateDto.BatchSmsRateDto) {
        return this.smsRateService.httpBaseFinanceBatchSmsRate(input)
    }
}
