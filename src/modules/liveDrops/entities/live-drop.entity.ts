import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Case } from '../../cases/case.entity'
import { CsgoSkin } from '../../skins/csgo-skin.entity'

@Entity('live_drops')
export class LiveDrop {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => CsgoSkin)
  @JoinColumn({ name: 'skin_id' })
  skin!: CsgoSkin

  @ManyToOne(() => Case)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'varchar', length: 50, nullable: true })
  username?: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
