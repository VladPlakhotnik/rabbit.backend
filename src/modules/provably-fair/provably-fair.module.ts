import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProvablyFair } from './provably-fair.entity'
import { ProvablyFairService } from './provably-fair.service'
import { ProvablyFairController } from './provably-fair.controller'
import { ThrottlerModule } from '@nestjs/throttler'

@Module({
  imports: [
    TypeOrmModule.forFeature([ProvablyFair]),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [ProvablyFairController],
  providers: [ProvablyFairService],
  exports: [ProvablyFairService],
})
export class ProvablyFairModule {}
