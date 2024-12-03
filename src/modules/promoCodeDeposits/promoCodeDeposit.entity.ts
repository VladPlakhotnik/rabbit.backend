// src/promo-code-deposits/promo-code-deposit.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { PromoCode } from '../promoCodes/promoCode.entity'

@Entity('promoCodeDeposits')
export class PromoCodeDeposit {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => PromoCode, promoCode => promoCode.deposits)
  @JoinColumn({ name: 'promo_code_id' })
  promoCode!: PromoCode

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  deposit_amount!: number
}
