import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NotificationService } from './notification.service'
import { NotificationController } from './notification.controller'
import { NotificationsGateway } from './notifications.gateway'
import { Notification } from './entities/notification.entity'
import { User } from '../users/user.entity'
import { NotificationView } from './entities/notificationView.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, NotificationView]),
    // Local JwtModule (no global registration to avoid coupling other
    // modules to it). Used by NotificationsGateway to verify the token
    // passed in the WS handshake.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationService, NotificationsGateway],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
