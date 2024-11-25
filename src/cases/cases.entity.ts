import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("cases")
export class Case {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 255 })
  imgurl!: string;

  @Column({ type: "double precision" })
  caseprice!: number;
}
