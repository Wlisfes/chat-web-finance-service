import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { RedisService } from '@wlisfes/chat-web-base-schema/redis'
import { DataSource } from 'typeorm'

type TableRow = { tableName: string }

@Injectable()
export class HealthService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly redisService: RedisService
    ) {}

    getLiveness() {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    async getReadiness() {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        let databaseReady = false
        let database: Record<string, unknown>
        try {
            const rows = (await this.dataSource.query(
                `SELECT table_name AS tableName FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name IN (${requiredTables.map(() => '?').join(', ')})`,
                requiredTables
            )) as TableRow[]
            const existing = new Set(rows.map(row => row.tableName))
            const missingTables = requiredTables.filter(table => !existing.has(table))
            databaseReady = this.dataSource.isInitialized && missingTables.length === 0
            database = { connected: this.dataSource.isInitialized, requiredTableCount: requiredTables.length, missingTables }
        } catch (error) {
            database = { connected: false, error: error instanceof Error ? error.message : String(error) }
        }
        let redisReady = false
        try {
            redisReady = await this.redisService.ping()
        } catch {
            redisReady = false
        }
        return {
            status: databaseReady && redisReady ? 'UP' : 'DOWN',
            database,
            redis: { connected: redisReady },
            auth: { mode: 'account-service-introspection' },
            timestamp: new Date().toISOString()
        }
    }
}
