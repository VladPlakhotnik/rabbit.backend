import { Module } from '@nestjs/common'
import { MinesController } from './mines.controller'
import { MinesService } from './mines.service'

@Module({
  controllers: [MinesController],
  providers: [MinesService],
  exports: [MinesService],
})
export class MinesModule {}
