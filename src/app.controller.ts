import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { Public } from '@/modules/auth/auth.decorator'
import { HealthService } from '@/modules/health/health.service'
import { AppService } from '@/app.service'

@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly healthService: HealthService
    ) {}

    @Public()
    @Get()
    root() {
        return this.appService.getHello()
    }

    @Public()
    @Get('health/live')
    liveness() {
        return this.healthService.getLiveness()
    }

    @Public()
    @Get(['health', 'health/ready'])
    @PreserveHttpStatus()
    async readiness() {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') throw new ServiceUnavailableException({ message: '财务服务尚未就绪', data: result })
        return result
    }
}
