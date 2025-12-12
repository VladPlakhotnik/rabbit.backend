import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('case_history')
export class CaseHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @Column({ type: 'integer' })
  case_id!: number

  @Column({ type: 'varchar', length: 100 })
  case_name!: string

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  case_price!: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  case_img?: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  server_seed?: string

  @Column({ type: 'integer', nullable: true })
  skin_id?: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  skin_img?: string

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  skin_price?: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
