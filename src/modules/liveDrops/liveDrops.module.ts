import { Module } from '@nestjs/common'
import { LiveDropsGateway } from './liveDrops.gateway'
import { LiveDropsService } from './liveDrops.service'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from '../cases/case.entity'
import { Skin } from '../skins/skin.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { LiveDrop } from './entities/live-drop.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Case, Skin, SkinCase, LiveDrop])],
  providers: [LiveDropsGateway, LiveDropsService],
  exports: [LiveDropsService],
})
export class LiveDropsModule {}
