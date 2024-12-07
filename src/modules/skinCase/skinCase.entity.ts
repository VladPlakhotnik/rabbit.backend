// src/skin-case/skin-case.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Case } from '../cases/case.entity'
import { Skin } from '../skins/skin.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('skincase')
export class SkinCase {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => Case, caseEntity => caseEntity.skinCases)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @ManyToOne(() => Skin, skin => skin.skinCases)
  @JoinColumn({ name: 'skin_id' })
  skin!: Skin

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  chance!: number

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  hidden_chance!: number

  @Column({ type: 'boolean' })
  is_drop_out!: boolean
}
