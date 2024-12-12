import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Skin } from './skin.entity'
import { SkinService } from './skin.service'
import { SkinController } from './skin.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Skin])],
  providers: [SkinService],
  controllers: [SkinController],
  exports: [SkinService],
})
export class SkinModule {}
