import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Section } from './section.entity'
import { SectionService } from './section.service'
import { SectionController } from './section.controller'
import { AdminSectionsController } from './admin-sections.controller'
import { Case } from '../cases/case.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Case, Section])],
  providers: [SectionService],
  controllers: [SectionController, AdminSectionsController],
  exports: [SectionService],
})
export class SectionModule {}
