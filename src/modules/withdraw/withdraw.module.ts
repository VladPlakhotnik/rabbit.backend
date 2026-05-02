import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Withdrawal } from './withdrawal.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { WithdrawService } from './withdraw.service'
import { WithdrawController } from './withdraw.controller'
import { SkinModule } from '../skins/skin.module'
import { NotificationModule } from '../notifications/notification.module'

// SkinModule is imported (not just type-imported) because we inject
// the per-game TM clients (`TM_CSGO_CLIENT`, `TM_DOTA2_CLIENT`) which
// are providers there. UserInventory comes via TypeOrmModule.forFeature
// directly — no circular import — but we still need the entity to
// query / lock inventory rows in the service.
@Module({
  imports: [
    TypeOrmModule.forFeature([Withdrawal, UserInventory]),
    SkinModule,
    NotificationModule,
  ],
  controllers: [WithdrawController],
  providers: [WithdrawService],
  exports: [WithdrawService],
})
export class WithdrawModule {}
