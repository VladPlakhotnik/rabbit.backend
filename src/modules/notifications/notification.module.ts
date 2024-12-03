import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationService } from './notification.service'
import { NotificationController } from './notification.controller'
import { Notification } from './notification.entity'
import { User } from '../users/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
