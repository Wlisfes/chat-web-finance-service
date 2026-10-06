import { Body, Get, Post, Query } from '@nestjs/common'
import { RequirePermissions, CurrentPrincipal, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FrozenSmsService } from '@/modules/frozen/sms/sms.service'
import * as SmsDto from '@/modules/frozen/sms/dto/sms.dto'

@ApifoxController('财务中心-短信基础价格', 'frozen/sms', { bearerAuth: true })
export class FrozenSmsController {
    constructor(private readonly frozenSmsService: FrozenSmsService) {}

    @RequirePermissions('chat:finance:frozen:sms')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取短信基础价格静态枚举' },
        response: { type: SmsDto.FrozenSmsEnumsResponseDto, description: '短信基础价格静态枚举' }
    })
    public async httpBaseFinanceFrozenSmsEnums() {
        return this.frozenSmsService.httpBaseFinanceFrozenSmsEnums()
    }

    @RequirePermissions('chat:finance:frozen:sms')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取短信基础价格详情' },
        request: { source: 'query', type: SmsDto.FrozenSmsKeyDto },
        response: { type: SmsDto.FrozenSmsResponseDto, description: '短信基础价格详情' }
    })
    public async httpBaseFinanceFrozenSmsResolver(@Query() query: SmsDto.FrozenSmsKeyDto) {
        return this.frozenSmsService.httpBaseFinanceFrozenSmsResolver(query)
    }

    @RequirePermissions('chat:finance:frozen:sms:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增短信基础价格' },
        request: { source: 'body', type: SmsDto.CreateFrozenSmsDto },
        response: { type: SmsDto.FrozenSmsResponseDto, description: '新增后的短信基础价格' }
    })
    public async httpBaseFinanceCreateFrozenSms(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: SmsDto.CreateFrozenSmsDto) {
        return this.frozenSmsService.httpBaseFinanceCreateFrozenSms(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:sms:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新短信基础价格' },
        request: { source: 'body', type: SmsDto.UpdateFrozenSmsDto },
        response: { type: SmsDto.FrozenSmsResponseDto, description: '更新后的短信基础价格' }
    })
    public async httpBaseFinanceUpdateFrozenSms(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: SmsDto.UpdateFrozenSmsDto) {
        return this.frozenSmsService.httpBaseFinanceUpdateFrozenSms(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:sms:fluctuate')
    @ApiServiceDecorator(Post('fluctuate'), {
        operation: { summary: '批量上调、下调短信基础价格' },
        request: { source: 'body', type: SmsDto.FluctuateFrozenSmsDto },
        response: { type: SmsDto.FluctuateFrozenSmsResponseDto, description: '批量调价结果' }
    })
    public async httpBaseFinanceFluctuateFrozenSms(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: SmsDto.FluctuateFrozenSmsDto
    ) {
        return this.frozenSmsService.httpBaseFinanceFluctuateFrozenSms(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:sms')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询短信基础价格' },
        request: { source: 'body', type: SmsDto.ListFrozenSmsDto },
        response: { type: SmsDto.FrozenSmsPageResponseDto, description: '短信基础价格分页数据' }
    })
    public async httpBaseFinanceColumnFrozenSms(@Body() input: SmsDto.ListFrozenSmsDto) {
        return this.frozenSmsService.httpBaseFinanceColumnFrozenSms(input)
    }
}
