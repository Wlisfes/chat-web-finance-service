export interface FinanceMysqlConfig {
    host: string
    port: number | string
    username: string
    password: string
    database?: string
    name?: string
    charset?: string
    timezone?: string
    logging?: boolean | string
    poolSize?: number | string
    connectTimeout?: number | string
    retryAttempts?: number | string
    retryDelay?: number | string
}
