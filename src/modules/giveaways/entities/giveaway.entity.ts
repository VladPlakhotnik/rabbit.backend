import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { CsgoSkin } from '../../skins/csgo-skin.entity'
import { User } from '../../users/user.entity'
import { numericTransformer } from '../../../common/helpers/numericTransformer'
import type { GiveawayType } from '../giveaways.logic'

export enum GiveawayStatus {
  UPCOMING = 'UPCOMING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('giveaways')
export class Giveaway {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @Column({ type: 'integer', name: 'skin_id' })
  skin_id!: number

  @ManyToOne(() => CsgoSkin)
  @JoinColumn({ name: 'skin_id' })
  skin!: CsgoSkin

  @Column({ type: 'integer', default: 0, name: 'participant_count' })
  participant_count!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'required_deposit_amount',
    transformer: numericTransformer,
  })
  required_deposit_amount!: number

  @Column({ type: 'integer', array: true, default: [] })
  participants!: number[]

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    name: 'giveaway_type',
  })
  giveaway_type!: GiveawayType | null

  @Column({ type: 'timestamp', name: 'start_time' })
  start_time!: Date

  @Column({ type: 'timestamp', name: 'end_time' })
  end_time!: Date

  @Column({
    type: 'enum',
    enum: GiveawayStatus,
    default: GiveawayStatus.UPCOMING,
  })
  status!: GiveawayStatus

  @Column({ type: 'integer', nullable: true, name: 'winner_user_id' })
  winner_user_id!: number | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'winner_user_id' })
  winner!: User | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
