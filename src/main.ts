import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule)
    app.enableShutdownHooks()
    const port = Number(process.env.PORT ?? app.get(ConfigService).get<number>('server.port', 3010))
    await setupSwagger(app, {
        title: 'Chat Web 财务服务 API',
        description: '品牌、币种、汇率、国家地区、消费客户与基础价格管理接口',
        port
    })
    console.log(`Chat Web 财务服务启动[${process.env.NODE_ENV}]: http://127.0.0.1:${port}`)
}

void bootstrap()
