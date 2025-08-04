// src/cases/case.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { Section } from '../sections/section.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 255 })
  img_url!: string

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  case_price!: number

  @Column({ type: 'integer' })
  remaining_count!: number

  @Column({ type: 'integer' })
  max_count!: number

  @Column({ type: 'boolean', default: false })
  is_popular!: boolean

  @Column({ type: 'boolean', default: false })
  is_limited!: boolean

  @OneToMany(() => UserInventory, inventory => inventory.case)
  inventories!: UserInventory[]

  @OneToMany(() => SkinCase, skinCase => skinCase.case)
  skinCases!: SkinCase[]

  @ManyToOne(() => Section, section => section.cases)
  @JoinColumn({ name: 'section_id' })
  section!: Section
}
