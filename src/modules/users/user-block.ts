import { BadRequestException } from '@nestjs/common'

export const USER_BLOCK_REASON_TEMPLATES = [
  'fraud',
  'chargeback',
  'multi_account',
  'terms_violation',
  'manual_review',
] as const

export type UserBlockReasonTemplate =
  (typeof USER_BLOCK_REASON_TEMPLATES)[number]

export interface UserBlockInput {
  reason?: string
  template?: string | null
}

export interface NormalizedUserBlockInput {
  reason: string
  template: UserBlockReasonTemplate | null
}

export const isUserBlockReasonTemplate = (
  value: string,
): value is UserBlockReasonTemplate =>
  USER_BLOCK_REASON_TEMPLATES.includes(value as UserBlockReasonTemplate)

export function normalizeUserBlockInput(
  input: UserBlockInput,
): NormalizedUserBlockInput {
  const reason = input.reason?.trim()
  if (!reason) {
    throw new BadRequestException('Block reason is required')
  }

  const template = input.template?.trim() || null
  if (template && !isUserBlockReasonTemplate(template)) {
    throw new BadRequestException('Invalid block reason template')
  }

  return {
    reason,
    template: template ? (template as UserBlockReasonTemplate) : null,
  }
}
