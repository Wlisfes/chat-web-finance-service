import 'dotenv/config'
import { setDefaultResultOrder } from 'node:dns'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { ReadableConsoleLogger, createRequestLoggingMiddleware } from '@wlisfes/chat-web-base-schema/logging'
import { requestContextMiddleware } from '@wlisfes/chat-web-base-schema/request-context'
import { AppModule } from '@/app.module'

// Docker 容器可能优先解析到不可达的 IPv6 地址；外部汇率请求统一优先使用 IPv4，避免连接超时。
setDefaultResultOrder('ipv4first')

const logger = new ReadableConsoleLogger({
    NODE_ENV: process.env.NODE_ENV,
    prefix: process.env.NACOS_SERVICE_NAME
})
async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger })
    app.enableShutdownHooks()
    app.use(requestContextMiddleware)
    app.use(createRequestLoggingMiddleware(process.env.NACOS_SERVICE_NAME))
    await setupSwagger(app, {
        title: 'Chat Web 财务服务 API',
        description: '品牌、币种、汇率、国家地区与基础价格管理接口',
        port: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV ?? 'development'
    }).then(async event => {
        logger.log(`Chat Web 财务服务启动[${event.NODE_ENV}]：http://127.0.0.1:${event.port}`)
        logger.log(`Swagger 文档：http://127.0.0.1:${event.port}/api/swagger`)
    })
}

void bootstrap().catch(error => {
    logger.error(error, 'Bootstrap')
    process.exitCode = 1
})
