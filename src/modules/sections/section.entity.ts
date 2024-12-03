import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm'
import { Case } from '../cases/case.entity'

@Entity('sections')
export class Section {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @OneToMany(() => Case, caseEntity => caseEntity.section)
  cases!: Case[]
}
