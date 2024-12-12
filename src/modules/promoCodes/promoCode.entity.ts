// src/promoCodes/promoCode.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm'
import { PromoCodeBonus } from '../promoCodeBonuses/promoCodeBonus.entity'
import { PromoCodeDeposit } from '../promoCodeDeposits/promoCodeDeposit.entity'

@Entity('promocodes')
export class PromoCode {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 50 })
  code!: string

  @Column({ type: 'varchar', length: 50 })
  type!: string // Тип кода: "deposit", "bonus", "partner"

  @Column({ type: 'int' })
  max_activations!: number

  @Column({ type: 'int' })
  current_activations!: number

  @Column({ type: 'boolean' })
  is_active!: boolean

  @Column({ type: 'timestamp' })
  created_at!: Date

  @Column({ type: 'timestamp', nullable: true })
  expires_at!: Date | null

  @OneToMany(() => PromoCodeDeposit, deposit => deposit.promoCode)
  deposits!: PromoCodeDeposit[]

  @OneToMany(() => PromoCodeBonus, bonus => bonus.promoCode)
  bonuses!: PromoCodeBonus[]
}
