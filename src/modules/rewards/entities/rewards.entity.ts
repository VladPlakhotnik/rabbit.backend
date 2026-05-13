import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm'
import { RewardType } from '../enums/reward-type.enum'
import { Case } from '../../cases/case.entity'
import { CsgoSkin } from '../../skins/csgo-skin.entity'
import { DotaSkin } from '../../skins/dota-skin.entity'
import { GameType } from '../../userInventory/userInventory.entity'

@Entity('rewards')
@Check(
  `(csgo_skin_id IS NULL OR dota_skin_id IS NULL)`,
)
export class Reward {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({
    type: 'enum',
    enum: RewardType,
  })
  type!: RewardType

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  value!: number

  @Column({ type: 'float' })
  drop_chance!: number

  @Column({ type: 'boolean', default: true })
  is_active!: boolean

  @Column({ type: 'integer', nullable: true })
  case_id!: number | null

  @ManyToOne(() => Case, { nullable: true })
  @JoinColumn({ name: 'case_id' })
  case!: Case | null

  @Column({ type: 'integer', nullable: true })
  csgo_skin_id!: number | null

  @ManyToOne(() => CsgoSkin, { nullable: true })
  @JoinColumn({ name: 'csgo_skin_id' })
  csgoSkin!: CsgoSkin | null

  @Column({ type: 'integer', nullable: true })
  dota_skin_id!: number | null

  @ManyToOne(() => DotaSkin, { nullable: true })
  @JoinColumn({ name: 'dota_skin_id' })
  dotaSkin!: DotaSkin | null

  @Column({ type: 'varchar', length: 16, nullable: true })
  game_type!: GameType | null

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date
}
