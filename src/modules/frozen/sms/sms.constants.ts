import { defineEnumMetadata } from '@wlisfes/chat-web-base-schema/utils'

/** 短信基础价格批量调价方式 */
export enum FrozenSmsFluctuateMode {
    INCREASE_NUMBER = 'increase_number',
    INCREASE_PRRCENT = 'increase_percent',
    DECREASE_NUMBER = 'decrease_number',
    DECREASE_PRRCENT = 'decrease_percent'
}

export const FrozenSmsFluctuateModeDefinition = defineEnumMetadata(FrozenSmsFluctuateMode, '调价方式', {
    [FrozenSmsFluctuateMode.INCREASE_NUMBER]: { label: '按金额上调', description: '在现有价格基础上按金额增加', type: 'success' },
    [FrozenSmsFluctuateMode.INCREASE_PRRCENT]: { label: '按百分比上调', description: '在现有价格基础上百分比增加', type: 'success' },
    [FrozenSmsFluctuateMode.DECREASE_NUMBER]: { label: '按金额下调', description: '在现有价格基础上按金额减少', type: 'error' },
    [FrozenSmsFluctuateMode.DECREASE_PRRCENT]: { label: '按百分比下调', description: '在现有价格基础上百分比减少', type: 'error' }
})

/** 调价方式对应的计算规则：increase=是否上调，amount=是否按金额（否则按百分比）。 */
export const FrozenSmsFluctuateRules: Record<FrozenSmsFluctuateMode, { increase: boolean; amount: boolean }> = {
    [FrozenSmsFluctuateMode.INCREASE_NUMBER]: { increase: true, amount: true },
    [FrozenSmsFluctuateMode.INCREASE_PRRCENT]: { increase: true, amount: false },
    [FrozenSmsFluctuateMode.DECREASE_NUMBER]: { increase: false, amount: true },
    [FrozenSmsFluctuateMode.DECREASE_PRRCENT]: { increase: false, amount: false }
}
