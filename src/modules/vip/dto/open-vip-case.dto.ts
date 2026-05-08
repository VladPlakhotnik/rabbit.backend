import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

import type { VipRewardCaseType } from '../vip-rewards.logic'

export class OpenVipCaseDto {
  @ApiProperty({
    enum: ['daily', 'gold', 'black'],
    example: 'daily',
  })
  @IsIn(['daily', 'gold', 'black'])
  case_type!: VipRewardCaseType
}
