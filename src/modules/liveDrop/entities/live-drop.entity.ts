import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Skin } from '../../skins/entities/skin.entity';
import { Case } from '../../cases/entities/case.entity';

@Entity('live_drops')
export class LiveDrop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true })
  user!: User;

  @Column({ nullable: true })
  userId!: string;

  @ManyToOne(() => Case)
  case!: Case;

  @Column()
  caseId!: string;

  @ManyToOne(() => Skin)
  skin!: Skin;

  @Column()
  skinId!: string;

  @Column()
  isBot!: boolean;

  @Column('decimal', { precision: 10, scale: 2 })
  skinPrice!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ default: false })
  isDisplayed!: boolean;
} 