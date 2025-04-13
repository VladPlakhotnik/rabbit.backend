import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skins')
export class Skin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price!: number;

  @Column()
  image!: string;

  @Column()
  rarity!: string;
} 