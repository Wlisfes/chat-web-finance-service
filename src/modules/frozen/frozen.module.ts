import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FINANCE_MYSQL_ENTITIES } from '@/database/database.constants'

@Module({
    imports: [TypeOrmModule.forFeature([...FINANCE_MYSQL_ENTITIES])],
    controllers: [],
    providers: [],
    exports: []
})
export class FrozenModule {}
