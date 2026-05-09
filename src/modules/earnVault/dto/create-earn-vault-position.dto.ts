import { Type } from 'class-transformer'
import { IsIn, IsNumber, Min } from 'class-validator'

import { EARN_VAULT_PLANS, type EarnVaultPlanId } from '../earn-vault.logic'

const EARN_VAULT_PLAN_IDS = EARN_VAULT_PLANS.map(plan => plan.id)

export class CreateEarnVaultPositionDto {
  @IsIn(EARN_VAULT_PLAN_IDS)
  plan_id!: EarnVaultPlanId

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number
}
