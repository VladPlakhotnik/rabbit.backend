import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Case } from '../../cases/case.entity'
import { Skin } from '../../skins/skin.entity'

@Entity('live_drops')
export class LiveDrop {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => Skin)
  @JoinColumn({ name: 'skin_id' })
  skin!: Skin

  @ManyToOne(() => Case)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'varchar', length: 50, nullable: true })
  username?: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
