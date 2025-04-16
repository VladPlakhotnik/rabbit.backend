import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LiveDrop } from './liveDrop.entity'
import { LiveDropService } from './liveDrop.service'
import { LiveDropController } from './liveDrop.controller'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  imports: [TypeOrmModule.forFeature([LiveDrop]), ScheduleModule.forRoot()],
  controllers: [LiveDropController],
  providers: [LiveDropService],
  exports: [LiveDropService],
})
export class LiveDropModule {}
