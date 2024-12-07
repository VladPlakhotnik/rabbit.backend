import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { Section } from '../sections/section.entity'
import { CaseService } from './case.service'
import { CaseController } from './case.controller'
import { SkinCase } from '../skinCase/skinCase.entity'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([Case, Section, SkinCase, User, UserInventory]),
  ],
  providers: [CaseService],
  controllers: [CaseController],
  exports: [CaseService],
})
export class CaseModule {}
