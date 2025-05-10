import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ClickerCase } from './clicker_case.entity'
import { Skin } from '../../skins/skin.entity'

@Entity('clicker_skin_case')
export class ClickerSkinCase {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => ClickerCase, clickerCase => clickerCase.skinCases)
  @JoinColumn({ name: 'case_id' })
  case!: ClickerCase

  @ManyToOne(() => Skin)
  @JoinColumn({ name: 'skin_id' })
  skin!: Skin

  @Column('numeric', { precision: 5, scale: 2 })
  chance!: number

  @Column('numeric', {
    name: 'hidden_chance',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  hidden_chance!: number

  @Column({ name: 'is_drop_out', default: false })
  is_drop_out!: boolean
}
