import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'bigint', unique: true }) // Поле 'steamid' как bigint
  steamid!: string

  @Column({ type: 'varchar', length: 255, nullable: true }) // Поле 'displayname'
  displayname!: string

  @Column({ type: 'varchar', length: 50, nullable: true }) // Поле 'role'
  role!: string

  @Column({ type: 'double precision', nullable: true }) // Поле 'balance'
  balance!: number

  @Column({ type: 'varchar', length: 255, nullable: true }) // Поле 'avatar'
  avatar!: string

  @Column({ type: 'varchar', length: 255, nullable: true }) // Поле 'profileurl'
  profileurl!: string

  @Column({ type: 'varchar', length: 255, nullable: true }) // Поле 'tradelink'
  tradelink!: string

  @Column({ type: 'int', nullable: true }) // Поле 'referral'
  referral!: number

  @CreateDateColumn({ type: 'timestamp', nullable: true }) // Поле 'created_at'
  created_at!: Date
}
