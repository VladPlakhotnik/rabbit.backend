import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { NotificationService } from './notification.service'
import { NotificationController } from './notification.controller'
import { NotificationsGateway } from './notifications.gateway'
import { Notification } from './entities/notification.entity'
import { User } from '../users/user.entity'
import { NotificationView } from './entities/notificationView.entity'
import { getAccessSecret } from '../auth/auth-secrets'

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, NotificationView]),
    // Local JwtModule (no global registration to avoid coupling other
    // modules to it). Used by NotificationsGateway to verify the access
    // token passed in the WS handshake. Must use the access secret —
    // not refresh — since the WS client supplies its short-lived
    // bearer, same as any HTTP request.
    JwtModule.register({
      secret: getAccessSecret(),
    }),
  ],
  providers: [NotificationService, NotificationsGateway],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
