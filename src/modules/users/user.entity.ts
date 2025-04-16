import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm'
import { Bonus } from '../bonuses/entities/bonus.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { Notification } from '../notifications/notification.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'bigint', unique: true })
  steam_id!: number

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

  @OneToMany(() => UserInventory, inventory => inventory.user)
  inventories!: UserInventory[]

  @OneToMany(() => Bonus, bonus => bonus.user)
  bonuses!: Bonus[]

  @OneToMany(() => Notification, notification => notification.user)
  notifications!: Notification[]
}
