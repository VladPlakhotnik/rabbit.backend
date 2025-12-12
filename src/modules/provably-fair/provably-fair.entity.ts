import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../users/user.entity'
import { GameType } from './enums/game-type.enum'

@Entity('provably_fair')
export class ProvablyFair {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'enum', enum: GameType })
  game_type!: GameType

  @Column({ type: 'jsonb', nullable: true })
  game_data!: Record<string, any>

  @Column({ type: 'varchar' })
  client_seed!: string

  @Column({ type: 'varchar' })
  server_seed!: string

  @Column({ type: 'varchar' })
  public_hash!: string

  @Column({ type: 'boolean', default: false })
  is_used!: boolean

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date
}
