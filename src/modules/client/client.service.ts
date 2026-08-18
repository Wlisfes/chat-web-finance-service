import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbFinanceBrand,
    TbFinanceBrandStatus,
    TbFinanceClient,
    TbFinanceClientAuthStatus,
    TbFinanceClientClassType,
    TbFinanceClientSettings,
    TbFinanceClientSource,
    TbFinanceClientStage,
    TbFinanceClientStatus,
    TbFinanceCurrency,
    TbFinanceCurrencyStatus
} from '@wlisfes/chat-web-base-schema/chat-web-finance-mysql'
import { In, Repository } from 'typeorm'
import { CreateClientDto, ListClientDto, UpdateClientDto, UpdateClientStatusDto } from '@/modules/client/dto/client.dto'

@Injectable()
export class ClientService {
    constructor(
        @InjectRepository(TbFinanceClient) private readonly repository: Repository<TbFinanceClient>,
        @InjectRepository(TbFinanceBrand) private readonly brandRepository: Repository<TbFinanceBrand>,
        @InjectRepository(TbFinanceCurrency) private readonly currencyRepository: Repository<TbFinanceCurrency>
    ) {}

    async create(actorUid: string, input: CreateClientDto) {
        await this.assertReferences(input.brandId, input.currency)
        return this.repository.manager.transaction(async manager => {
            const client = await manager.save(
                manager.create(TbFinanceClient, {
                    ownerUserUid: actorUid,
                    name: input.name,
                    alias: input.alias,
                    brandKeyId: input.brandId,
                    currency: input.currency,
                    email: input.email,
                    phone: input.phone,
                    status: input.status ?? TbFinanceClientStatus.ENABLE,
                    payMode: input.payMode,
                    classType: TbFinanceClientClassType.COMMON,
                    balance: 0,
                    balanceUsd: 0,
                    credit: 0,
                    creditUsd: 0,
                    level: 1,
                    stage: TbFinanceClientStage.CLUETRAIL,
                    authStatus: input.authStatus ?? TbFinanceClientAuthStatus.UNVERIFIED,
                    source: input.source ?? TbFinanceClientSource.MANUAL,
                    remark: input.remark
                })
            )
            await manager.save(
                manager.create(TbFinanceClientSettings, {
                    clientKeyId: client.keyId,
                    smsActive: false,
                    smsMax: 1,
                    mailActive: false,
                    mailMax: 1,
                    socialActive: false,
                    socialMax: 1
                })
            )
            return this.toLegacy(client)
        })
    }

    async update(input: UpdateClientDto) {
        await this.assertReferences(input.brandId, input.currency)
        const client = await this.findRequired(input.keyId)
        this.repository.merge(client, {
            name: input.name,
            alias: input.alias,
            brandKeyId: input.brandId,
            currency: input.currency,
            email: input.email,
            phone: input.phone,
            payMode: input.payMode,
            remark: input.remark
        })
        return this.toLegacy(await this.repository.save(client))
    }

    async updateStatus(input: UpdateClientStatusDto) {
        const client = await this.findRequired(input.keyId)
        client.status = input.status
        return this.toLegacy(await this.repository.save(client))
    }

    async list(input: ListClientDto) {
        const query = this.repository.createQueryBuilder('client')
        if (input.name?.trim()) query.andWhere('(client.name LIKE :name OR client.keyId LIKE :name)', { name: `%${input.name.trim()}%` })
        if (input.status) query.andWhere('client.status = :status', { status: input.status })
        if (input.brandId) query.andWhere('client.brandKeyId = :brandKeyId', { brandKeyId: input.brandId })
        if (input.currency) query.andWhere('client.currency = :currency', { currency: input.currency })
        if (input.payMode) query.andWhere('client.payMode = :payMode', { payMode: input.payMode })
        if (input.authStatus) query.andWhere('client.authStatus = :authStatus', { authStatus: input.authStatus })
        if (input.source) query.andWhere('client.source = :source', { source: input.source })
        query
            .orderBy('client.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [clients, total] = await query.getManyAndCount()
        const brands = clients.length
            ? await this.brandRepository.find({ where: { keyId: In([...new Set(clients.map(client => client.brandKeyId))]) } })
            : []
        const brandsByKey = new Map(brands.map(brand => [brand.keyId, brand]))
        return {
            page: input.page,
            size: input.size,
            total,
            list: clients.map(client => ({
                ...this.toLegacy(client),
                brandOptions: brandsByKey.get(client.brandKeyId),
                accountOptions: { uid: client.ownerUserUid },
                deptOptions: []
            }))
        }
    }

    private toLegacy(client: TbFinanceClient) {
        return { ...client, userId: client.ownerUserUid, brandId: client.brandKeyId }
    }

    private async findRequired(keyId: number) {
        const client = await this.repository.findOneBy({ keyId })
        if (!client) throw new NotFoundException('客户不存在')
        return client
    }

    private async assertReferences(brandKeyId: number, currency: string) {
        const [brand, currencyNode] = await Promise.all([
            this.brandRepository.findOneBy({ keyId: brandKeyId, status: TbFinanceBrandStatus.ENABLE }),
            this.currencyRepository.findOneBy({ currency, status: TbFinanceCurrencyStatus.ENABLE })
        ])
        if (!brand) throw new BadRequestException('归属品牌不存在或已禁用')
        if (!currencyNode) throw new BadRequestException('币种不存在或已禁用')
    }
}
