import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerUser } from './entities/clicker_user.entity'
import { ClickerUserController } from './clicker-user.controller'
import { ClickerUserService } from './clicker-user.service'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerUser])],
  providers: [ClickerUserService],
  controllers: [ClickerUserController],
  exports: [ClickerUserService],
})
export class ClickerUserModule {}
