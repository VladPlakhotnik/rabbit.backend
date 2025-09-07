// src/user-inventory/user-inventory.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { Case } from '../cases/case.entity'

@Entity('user_inventory')
@Check(
  `(is_withdrawn = TRUE AND withdrawn_at IS NOT NULL) OR (is_withdrawn = FALSE)`,
)
export class UserInventory {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User, user => user.inventories)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @ManyToOne(() => CsgoSkin, skin => skin.id)
  @JoinColumn({ name: 'skin_id' })
  skin!: CsgoSkin

  @ManyToOne(() => Case, caseEntity => caseEntity.inventories)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'timestamp' })
  obtained_at!: Date

  @Column({ type: 'boolean' })
  is_sold!: boolean

  @Column({ type: 'boolean' })
  is_withdrawn!: boolean

  @Column({ type: 'timestamp', nullable: true })
  withdrawn_at!: Date | null
}
