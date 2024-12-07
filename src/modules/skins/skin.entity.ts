// src/skins/skin.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

@Entity('skins')
export class Skin {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 255 })
  img_url!: string

  @Column({ type: 'varchar', length: 50 })
  rarity!: string

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  skin_price!: number

  @OneToMany(() => UserInventory, inventory => inventory.skin)
  inventories!: UserInventory[]

  @OneToMany(() => SkinCase, skinCase => skinCase.skin)
  skinCases!: SkinCase[]
}
