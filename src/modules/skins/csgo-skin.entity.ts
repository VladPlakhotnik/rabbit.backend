import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('csgo_skins')
export class CsgoSkin {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255, unique: true })
  market_hash_name!: string

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  market_price!: number

  @Column({ type: 'varchar' })
  image!: string

  @Column({ type: 'boolean', default: false })
  is_new!: boolean

  @Column({ type: 'varchar', length: 255 })
  amount_in_market!: string

  @Column({ type: 'varchar' })
  inspect_in_game!: string

  @Column({ type: 'varchar', length: 255 })
  quality!: string

  @Column({ type: 'varchar', length: 255 })
  exterior!: string

  @Column({ type: 'varchar', length: 255 })
  category!: string

  @Column({ type: 'varchar', length: 255 })
  slug!: string

  @Column({ type: 'varchar', length: 255 })
  name_color!: string

  @Column({ type: 'varchar', length: 255 })
  background_color!: string

  @Column({ type: 'varchar', length: 255 })
  item_type!: string

  @Column({ type: 'varchar', length: 255 })
  collection!: string[]

  @Column({ type: 'float' })
  float_value!: number

  @Column({ type: 'varchar', length: 20 })
  float_part_value!: string

  @Column({ type: 'integer' })
  pattern!: number

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date

  @OneToMany('SkinCase', 'skin')
  skinCases!: any[]
}
