// src/promo-code-bonuses/promo-code-bonus.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { PromoCode } from '../promoCodes/promoCode.entity'

@Entity('promocodebonuses')
export class PromoCodeBonus {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => PromoCode, promoCode => promoCode.bonuses)
  @JoinColumn({ name: 'promo_code_id' })
  promoCode!: PromoCode

  @Column({ type: 'varchar', length: 50 })
  bonus_type!: string // Тип бонуса (например, "money", "discount", "item")

  @Column({ type: 'varchar', length: 100 })
  bonus_value!: string // Значение бонуса (например, "10", "5%", "skin_id")
}
