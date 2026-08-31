import { Get } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { AppService } from '@/app.service'
import { ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'

@ApifoxController('财务服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), {
        operation: { summary: '查看财务服务信息' },
        response: { type: String, description: '财务服务名称' }
    })
    public async httpBaseFinanceResolverService() {
        return this.appService.httpBaseFinanceResolverService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '财务服务存活检查' },
        response: { type: ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    public async httpBaseFinanceLiveHealth() {
        return this.appService.httpBaseFinanceLiveHealth()
    }

    @Public()
    @ApiServiceDecorator(Get(['health', 'health/ready']), {
        operation: { summary: '财务服务就绪检查' },
        response: { type: ServiceReadinessResponseDto, description: '数据库、Redis 与鉴权配置状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseFinanceReadyHealth() {
        return this.appService.httpBaseFinanceReadyHealth()
    }
}
