import { Module } from '@nestjs/common'
import { PaymentController } from './payment.controller'
import { StripeService } from './stripe.service'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [ConfigModule],
  controllers: [PaymentController],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentModule {}
