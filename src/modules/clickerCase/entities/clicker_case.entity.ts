import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm'
import { ClickerSkinCase } from './clicker_skin_case.entity'

@Entity('clicker_cases')
export class ClickerCase {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  name!: string

  @Column()
  description!: string

  @Column({ name: 'image_url' })
  image_url!: string

  @Column({ name: 'case_price' })
  case_price!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date

  @OneToMany(() => ClickerSkinCase, skinCase => skinCase.case)
  skinCases!: ClickerSkinCase[]
}
