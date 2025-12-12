import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_energy_levels')
export class ClickerEnergyLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column({ name: 'image_url' })
  image_url!: string

  @Column({ name: 'energy_amount' })
  energy_amount!: number

  @Column({ name: 'upgrade_cost' })
  upgrade_cost!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
