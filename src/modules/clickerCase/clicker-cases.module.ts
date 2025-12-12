import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerCase } from './entities/clicker_case.entity'
import { ClickerSkinCase } from './entities/clicker_skin_case.entity'
import { ClickerCasesService } from './clicker-cases.service'
import { ClickerCasesController } from './clicker-cases.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerCase, ClickerSkinCase])],
  providers: [ClickerCasesService],
  controllers: [ClickerCasesController],
  exports: [ClickerCasesService],
})
export class ClickerCasesModule {}
