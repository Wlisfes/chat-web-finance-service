import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbFinanceBrand, TbFinanceBrandStatus } from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { Repository } from 'typeorm'
import { CreateBrandDto, ListBrandDto, UpdateBrandDto, UpdateBrandStatusDto } from '@/modules/brand/dto/brand.dto'

@Injectable()
export class BrandService {
    constructor(@InjectRepository(TbFinanceBrand) private readonly repository: Repository<TbFinanceBrand>) {}

    async create(actorUid: string, input: CreateBrandDto) {
        await this.assertNameAvailable(input.name)
        return this.repository.save(this.repository.create({ ...input, createBy: actorUid, modifyBy: actorUid }))
    }

    async update(actorUid: string, input: UpdateBrandDto) {
        const brand = await this.findRequired(input.keyId)
        await this.assertNameAvailable(input.name, input.keyId)
        this.repository.merge(brand, input, { modifyBy: actorUid })
        return this.repository.save(brand)
    }

    async updateStatus(actorUid: string, input: UpdateBrandStatusDto) {
        const brand = await this.findRequired(input.keyId)
        brand.status = input.status
        brand.modifyBy = actorUid
        return this.repository.save(brand)
    }

    async list(input: ListBrandDto) {
        const query = this.repository.createQueryBuilder('brand')
        if (input.name?.trim()) query.andWhere('brand.name LIKE :name', { name: `%${input.name.trim()}%` })
        if (input.status) query.andWhere('brand.status = :status', { status: input.status })
        query
            .orderBy('brand.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [items, total] = await query.getManyAndCount()
        return {
            page: input.page,
            size: input.size,
            total,
            list: items.map(item => ({
                ...item,
                createByOptions: item.createBy ? { uid: item.createBy } : undefined,
                modifyByOptions: item.modifyBy ? { uid: item.modifyBy } : undefined
            }))
        }
    }

    async select() {
        const list = await this.repository.find({ where: { status: TbFinanceBrandStatus.ENABLE }, order: { createTime: 'DESC' } })
        return { list }
    }

    private async findRequired(keyId: number) {
        const brand = await this.repository.findOneBy({ keyId })
        if (!brand) throw new NotFoundException('品牌不存在')
        return brand
    }

    private async assertNameAvailable(name: string, excludedKeyId?: number) {
        const query = this.repository.createQueryBuilder('brand').where('brand.name = :name', { name: name.trim() })
        if (excludedKeyId) query.andWhere('brand.keyId <> :excludedKeyId', { excludedKeyId })
        if (await query.getExists()) throw new ConflictException('品牌名称已存在')
    }
}
