import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './user.entity'
import { UserService } from './users.service'
import { UserController } from './users.controller'
import { UserInventory } from '../userInventory/userInventory.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { Notification } from '../notifications/entities/notification.entity'
import { HttpModule } from '@nestjs/axios'
import { SocialModule } from '../social/social.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserInventory,
      CsgoSkin,
      Case,
      SkinCase,
      Notification,
    ]),
    HttpModule,
    SocialModule,
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
