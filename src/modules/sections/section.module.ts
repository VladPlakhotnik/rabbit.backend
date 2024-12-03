import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Section } from './section.entity'
import { SectionService } from './section.service'
import { SectionController } from './section.controller'
import { Case } from '../cases/case.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Case, Section])],
  providers: [SectionService],
  controllers: [SectionController],
  exports: [SectionService],
})
export class SectionModule {}
