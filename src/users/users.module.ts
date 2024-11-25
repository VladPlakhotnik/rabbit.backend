import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './users.entity'
import { UserService } from './users.service'
import { UserController } from './users.controller'

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService], // Экспортируем для использования в других модулях
})
export class UserModule {}
