import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiveDrop } from './entities/live-drop.entity';
import { LiveDropService } from './live-drop.service';
import { LiveDropController } from './live-drop.controller';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([LiveDrop]),
    ScheduleModule.forRoot(),
  ],
  controllers: [LiveDropController],
  providers: [LiveDropService],
  exports: [LiveDropService],
})
export class LiveDropModule {} 