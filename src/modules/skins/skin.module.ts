// import { Module } from '@nestjs/common'
// import { HttpModule } from '@nestjs/axios'
// // import { SkinController } from './skin.controller'
// // import { SkinStorageService } from './skin-storage.service'

// @Module({
//   imports: [HttpModule],
//   // controllers: [SkinController],
//   // providers: [SkinStorageService],
//   // exports: [SkinStorageService],
// })
// export class SkinModule {}

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
