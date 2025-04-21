import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { PromoCode } from './promoCode.entity'
import { Skin } from '../../skins/skin.entity'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

export enum RewardType {
  BALANCE = 'BALANCE',
  DEPOSIT_BONUS = 'DEPOSIT_BONUS',
  SKIN = 'SKIN',
}

@Entity('promo_code_rewards')
export class PromoCodeReward {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => PromoCode, promoCode => promoCode.rewards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'promo_code_id' })
  promo_code!: PromoCode

  @Column({ type: 'enum', enum: RewardType })
  reward_type!: RewardType

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  value!: number

  @ManyToOne(() => Skin, { nullable: true })
  @JoinColumn({ name: 'skin_id' })
  skin!: Skin | null

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  min_deposit!: number | null

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  max_bonus!: number | null

  @Column({ type: 'boolean', default: false })
  is_demo!: boolean
}
