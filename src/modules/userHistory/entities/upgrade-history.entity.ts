import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('upgrade_history')
export class UpgradeHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @Column({ type: 'integer' })
  skin_id!: number

  @Column({ type: 'varchar', length: 100 })
  skin_name!: string

  @Column({ type: 'varchar', length: 50 })
  old_rarity!: string

  @Column({ type: 'varchar', length: 50 })
  new_rarity!: string

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
