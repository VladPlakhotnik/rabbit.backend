import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PaymentController } from './payment.controller'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { NotificationModule } from '../notifications/notification.module'
import { PartnerModule } from '../partners/partner.module'
import { UserDeposit } from '../users/user-deposit.entity'
import { User } from '../users/user.entity'
import { SkinsbackClient } from './skinsback.client'
import { SkinsbackService } from './skinsback.service'

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    NotificationModule,
    PartnerModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forFeature([User, UserDeposit]),
  ],
  controllers: [PaymentController],
  providers: [SkinsbackClient, SkinsbackService],
  exports: [SkinsbackService],
})
export class PaymentModule {}
