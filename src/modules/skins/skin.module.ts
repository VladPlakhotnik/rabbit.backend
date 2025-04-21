import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { SkinController } from './skin.controller'
import { SkinStorageService } from './skin-storage.service'

@Module({
  imports: [HttpModule],
  controllers: [SkinController],
  providers: [SkinStorageService],
  exports: [SkinStorageService],
})
export class SkinModule {}
