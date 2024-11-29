import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Case } from "./cases.entity";
import { CaseService } from "./cases.service";
import { CaseController } from "./cases.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Case])],
  providers: [CaseService],
  controllers: [CaseController],
})
export class CaseModule {}
