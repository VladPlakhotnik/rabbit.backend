import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'bigint', unique: true, nullable: true })
  steam_id!: number | null

  @Column({ type: 'varchar', length: 100 })
  display_name!: string

  @Column({ type: 'varchar', length: 50 })
  role!: string

  @Column({ type: 'varchar', length: 255 })
  avatar!: string

  @Column({ type: 'int', default: 0 })
  opened_cases!: number

  @Column({ type: 'int', default: 0 })
  upgraded_skins!: number

  @Column({ type: 'int', default: 0 })
  deposit_amount!: number

  @Column({
    name: 'vip_qualifying_volume',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  vip_qualifying_volume!: number

  @Column({
    name: 'vip_xp',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  vip_xp!: number

  @Column({
    name: 'vip_theoretical_rake',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  vip_theoretical_rake!: number

  @Column({ type: 'int', default: 0 })
  withdrawal_amount!: number

  @Column({ type: 'varchar', length: 50 })
  rank!: string

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  balance!: number

  @Column({ type: 'varchar', length: 255 })
  profile_url!: string

  @Column({ type: 'varchar', length: 255 })
  trade_link!: string | null

  @Column({ type: 'timestamp' })
  created_at!: Date

  @Column({ type: 'int', nullable: true, name: 'referral_parent_id' })
  referral_parent_id?: number | null

  @Column({ type: 'int', nullable: true, name: 'referral_campaign_id' })
  referral_campaign_id?: number | null

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'referral_source' })
  referral_source?: string | null

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'referral_sub_id' })
  referral_sub_id?: string | null

  @Column({
    type: 'bigint',
    nullable: true,
    unique: true,
    name: 'telegram_user_id',
  })
  telegram_user_id!: number | null

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
    name: 'google_id',
  })
  google_id!: string | null

  @Column({
    type: 'boolean',
    default: false,
    name: 'telegram_bonus_claimed',
  })
  telegram_bonus_claimed!: boolean

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    unique: true,
    name: 'discord_user_id',
  })
  discord_user_id!: string | null

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'discord_username',
  })
  discord_username!: string | null

  @Column({
    type: 'boolean',
    default: false,
    name: 'discord_bonus_claimed',
  })
  discord_bonus_claimed!: boolean

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'steam_avatar_bonus_claimed_at',
  })
  steam_avatar_bonus_claimed_at!: Date | null

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'steam_avatar_bonus_last_verified_at',
  })
  steam_avatar_bonus_last_verified_at!: Date | null

  @Column({
    type: 'boolean',
    default: false,
    name: 'steam_avatar_bonus_active',
  })
  steam_avatar_bonus_active!: boolean

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'steam_nickname_bonus_claimed_at',
  })
  steam_nickname_bonus_claimed_at!: Date | null

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'steam_nickname_bonus_last_verified_at',
  })
  steam_nickname_bonus_last_verified_at!: Date | null

  @Column({
    type: 'boolean',
    default: false,
    name: 'steam_nickname_bonus_active',
  })
  steam_nickname_bonus_active!: boolean

  @OneToMany(() => UserInventory, inventory => inventory.user)
  inventories!: UserInventory[]

  // @OneToMany(() => Notification, notification => notification.user)
  // notifications!: Notification[]
}
