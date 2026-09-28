import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { HealthService } from '@/health/health.service'
import * as HealthDto from '@/health/dto/health.dto'

@Injectable()
export class AppService {
    constructor(private readonly healthService: HealthService) {}

    /**财务服务信息*/
    public async httpBaseFinanceResolverService(): Promise<string> {
        return 'Chat Web Finance Service'
    }

    /**财务服务存活状态*/
    public async httpBaseFinanceLiveHealth(): Promise<HealthDto.ServiceLivenessResponseDto> {
        return this.healthService.getLiveness()
    }

    /**财务服务就绪状态*/
    public async httpBaseFinanceReadyHealth(): Promise<HealthDto.ServiceReadinessResponseDto> {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') {
            throw new ServiceUnavailableException({ message: '财务服务尚未就绪', data: result })
        }
        return result
    }
}
