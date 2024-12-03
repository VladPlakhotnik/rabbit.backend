import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { Section } from '../sections/section.entity'
import { CaseService } from './case.service'
import { CaseController } from './case.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Case, Section])],
  providers: [CaseService],
  controllers: [CaseController],
  exports: [CaseService],
})
export class CaseModule {}
