import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export interface NewsContentBlock {
  type: 'title' | 'text' | 'image' | 'video' | 'link' | 'list'
  content?: string
  url?: string
  alt?: string
}

@Entity('news')
export class News {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string

  @Column({ type: 'varchar' })
  preview_image!: string

  @Column({ type: 'varchar', length: 255 })
  title!: string

  @Column({ type: 'varchar', length: 255 })
  category!: string

  @Column({ type: 'jsonb' })
  content!: NewsContentBlock[]

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
