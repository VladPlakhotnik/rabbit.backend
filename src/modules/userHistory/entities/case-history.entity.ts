import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

// Per-drop record stored inside the `drops` JSONB array. One open-case
// event can carry 1..N of these (multi-open ×5 produces 5 entries in
// one row instead of 5 rows).
export interface CaseHistoryDrop {
  skin_id?: number
  skin_name?: string
  skin_img?: string
  skin_price?: number
  // Per-drop seed kept here so provably-fair verification still works on
  // a single drop within a multi-open event.
  server_seed?: string
}

@Entity('case_history')
export class CaseHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @Column({ type: 'integer' })
  case_id!: number

  @Column({ type: 'varchar', length: 100 })
  case_name!: string

  // Per-case price (i.e. one box). Total spent on this event is
  // `case_price * total_drops` and is also denormalised below.
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  case_price!: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  case_img?: string

  // === Event-level fields (one row = one open-case event) ===

  // How many boxes were opened in this single event (1..5 today).
  @Column({ type: 'integer', default: 1 })
  total_drops!: number

  // Denormalised `case_price * total_drops`. Trades a few bytes for a
  // simple WHERE clause on aggregate spend without computing on every
  // read. Nullable until the migration backfills it.
  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  total_cost?: number

  // Array of drops produced by this event. Stored as JSONB so each row
  // is one event regardless of count — avoids both the row explosion of
  // a child table and the JOIN cost on history reads.
  @Column({ type: 'jsonb', nullable: true })
  drops?: CaseHistoryDrop[]

  // === Legacy single-drop fields ===
  // Kept on the schema for rows written before the event-aggregation
  // migration. New code writes `drops`/`total_*` above and only mirrors
  // the *first* drop into these for backward compatibility with anything
  // still reading them. Safe to drop entirely once no consumer needs them.

  @Column({ type: 'varchar', length: 255, nullable: true })
  server_seed?: string

  @Column({ type: 'integer', nullable: true })
  skin_id?: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  skin_img?: string

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  skin_price?: number

  @Column({ type: 'varchar', length: 255, nullable: true })
  skin_name?: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
