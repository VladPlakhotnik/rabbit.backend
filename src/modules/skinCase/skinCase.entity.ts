// src/skin-case/skin-case.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Case } from '../cases/case.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('skin_case')
export class SkinCase {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => Case, caseEntity => caseEntity.skinCases)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'varchar', nullable: true })
  skin_hash_name?: string

  @ManyToOne(() => CsgoSkin, { nullable: true })
  @JoinColumn({
    name: 'skin_hash_name',
    referencedColumnName: 'market_hash_name',
  })
  skin!: CsgoSkin

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  chance!: number

  @Column({ type: 'boolean' })
  is_drop_out!: boolean
}
