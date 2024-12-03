import { Module } from '@nestjs/common'
import { PaymentController } from './payment.controller'

@Module({
  //   imports: [TypeOrmModule.forFeature([Notification, User])],
  //   providers: [NotificationService],
  controllers: [PaymentController],
  //   exports: [NotificationService],
})
export class PaymentModule {}
