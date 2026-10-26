import { Body, Get, Post, Query } from '@nestjs/common'
import { RequirePermissions, CurrentPrincipal, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FrozenSimbankService } from '@/modules/frozen/simbank/simbank.service'
import * as SimbankDto from '@/modules/frozen/simbank/dto/simbank.dto'

@ApifoxController('财务中心-simbank 基础成本价格', 'frozen/simbank', { bearerAuth: true })
export class FrozenSimbankController {
    constructor(private readonly frozenSimbankService: FrozenSimbankService) {}

    @RequirePermissions('chat:finance:frozen:simbank')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取simbank 基础成本价格静态枚举' },
        response: { type: SimbankDto.FrozenSimbankEnumsResponseDto, description: 'simbank 基础成本价格静态枚举' }
    })
    public async httpBaseFinanceFrozenSimbankEnums() {
        return this.frozenSimbankService.httpBaseFinanceFrozenSimbankEnums()
    }

    @RequirePermissions('chat:finance:frozen:simbank')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取simbank 基础成本价格详情' },
        request: { source: 'query', type: SimbankDto.FrozenSimbankKeyDto },
        response: { type: SimbankDto.FrozenSimbankResponseDto, description: 'simbank 基础成本价格详情' }
    })
    public async httpBaseFinanceFrozenSimbankResolver(@Query() query: SimbankDto.FrozenSimbankKeyDto) {
        return this.frozenSimbankService.httpBaseFinanceFrozenSimbankResolver(query)
    }

    @RequirePermissions('chat:finance:frozen:simbank:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增simbank 基础成本价格' },
        request: { source: 'body', type: SimbankDto.CreateFrozenSimbankDto },
        response: { type: SimbankDto.FrozenSimbankResponseDto, description: '新增后的simbank 基础成本价格' }
    })
    public async httpBaseFinanceCreateFrozenSimbank(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: SimbankDto.CreateFrozenSimbankDto
    ) {
        return this.frozenSimbankService.httpBaseFinanceCreateFrozenSimbank(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:simbank:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新simbank 基础成本价格' },
        request: { source: 'body', type: SimbankDto.UpdateFrozenSimbankDto },
        response: { type: SimbankDto.FrozenSimbankResponseDto, description: '更新后的simbank 基础成本价格' }
    })
    public async httpBaseFinanceUpdateFrozenSimbank(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: SimbankDto.UpdateFrozenSimbankDto
    ) {
        return this.frozenSimbankService.httpBaseFinanceUpdateFrozenSimbank(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:simbank:fluctuate')
    @ApiServiceDecorator(Post('fluctuate'), {
        operation: { summary: '批量上调、下调simbank 基础成本价格' },
        request: { source: 'body', type: SimbankDto.FluctuateFrozenSimbankDto },
        response: { type: SimbankDto.FluctuateFrozenSimbankResponseDto, description: '批量调价结果' }
    })
    public async httpBaseFinanceFluctuateFrozenSimbank(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: SimbankDto.FluctuateFrozenSimbankDto
    ) {
        return this.frozenSimbankService.httpBaseFinanceFluctuateFrozenSimbank(principal, input)
    }

    @RequirePermissions('chat:finance:frozen:simbank')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询simbank 基础成本价格' },
        request: { source: 'body', type: SimbankDto.ListFrozenSimbankDto },
        response: { type: SimbankDto.FrozenSimbankPageResponseDto, description: 'simbank 基础成本价格分页数据' }
    })
    public async httpBaseFinanceColumnFrozenSimbank(@Body() input: SimbankDto.ListFrozenSimbankDto) {
        return this.frozenSimbankService.httpBaseFinanceColumnFrozenSimbank(input)
    }
}
