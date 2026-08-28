import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { ReadableConsoleLogger, createRequestLoggingMiddleware } from '@wlisfes/chat-web-base-schema/logging'
import { requestContextMiddleware } from '@wlisfes/chat-web-base-schema/request-context'
import { AppModule } from '@/app.module'

const serviceName = 'chat-web-finance-service'
const logger = new ReadableConsoleLogger({ NODE_ENV: process.env.NODE_ENV, prefix: serviceName })

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger })
    app.enableShutdownHooks()
    app.use(requestContextMiddleware)
    app.use(createRequestLoggingMiddleware(serviceName))
    const port = Number(process.env.PORT ?? app.get(ConfigService).get<number>('server.port', 3010))
    await setupSwagger(app, {
        title: 'Chat Web 财务服务 API',
        description: '品牌、币种、汇率、国家地区与基础价格管理接口',
        port,
        NODE_ENV: process.env.NODE_ENV ?? 'development'
    })
    logger.log(`Chat Web 财务服务启动[${process.env.NODE_ENV}]：http://127.0.0.1:${port}`)
    logger.log(`Swagger 文档：http://127.0.0.1:${port}/api/swagger`)
}

void bootstrap().catch(error => {
    logger.error(error, 'Bootstrap')
    process.exitCode = 1
})
