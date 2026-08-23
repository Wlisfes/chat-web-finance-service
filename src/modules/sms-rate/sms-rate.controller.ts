import { Body, Post } from '@nestjs/common'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { TbFinanceBasicSmsRateDto } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { BatchSmsRateDto, CreateSmsRateDto, ListSmsRateDto, UpdateSmsRateDto } from '@/modules/sms-rate/dto/sms-rate.dto'
import { SmsRateService } from '@/modules/sms-rate/sms-rate.service'
import { BatchSmsRateResponseDto, SmsRatePageResponseDto } from '@/dto/api-response.dto'

@ApifoxController('财务中心-短信基础价格', 'rates/sms', { bearerAuth: true })
export class SmsRateController {
    constructor(private readonly smsRateService: SmsRateService) {}

    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增短信基础价格' },
        request: { source: 'body', type: CreateSmsRateDto },
        response: { type: TbFinanceBasicSmsRateDto, description: '新增后的短信基础价格' }
    })
    httpBaseFinanceCreateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateSmsRateDto) {
        return this.smsRateService.create(principal.uid, input)
    }
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新短信基础价格' },
        request: { source: 'body', type: UpdateSmsRateDto },
        response: { type: TbFinanceBasicSmsRateDto, description: '更新后的短信基础价格' }
    })
    httpBaseFinanceUpdateSmsRate(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateSmsRateDto) {
        return this.smsRateService.update(principal.uid, input)
    }
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询短信基础价格' },
        request: { source: 'body', type: ListSmsRateDto },
        response: { type: SmsRatePageResponseDto, description: '短信基础价格分页数据' }
    })
    httpBaseFinanceColumnSmsRate(@Body() input: ListSmsRateDto) {
        return this.smsRateService.list(input)
    }
    @ApiServiceDecorator(Post('batch'), {
        operation: { summary: '按国家地区批量查询短信基础价格' },
        request: { source: 'body', type: BatchSmsRateDto },
        response: { type: BatchSmsRateResponseDto, isArray: true, description: '国家地区短信基础价格列表' }
    })
    httpBaseFinanceBatchSmsRate(@Body() input: BatchSmsRateDto) {
        return this.smsRateService.batch(input)
    }
}
