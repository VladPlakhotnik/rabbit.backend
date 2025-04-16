import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../../users/user.entity'

@Entity('userspincooldown')
export class UserSpinCooldown {
  @PrimaryGeneratedColumn()
  id!: number

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'timestamp' })
  last_spin!: Date

  @Column({ type: 'timestamp' })
  next_available!: Date

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date
}
