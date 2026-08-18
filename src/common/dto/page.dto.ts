import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

export class PageDto {
    @Type(() => Number)
    @IsInt({ message: '页码必须是整数' })
    @Min(1, { message: '页码不能小于1' })
    page = 1

    @Type(() => Number)
    @IsInt({ message: '每页数量必须是整数' })
    @Min(1, { message: '每页数量不能小于1' })
    @Max(100, { message: '每页数量不能超过100' })
    size = 50
}
