import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { SteamStrategy } from './steam.strategy'
import { UserModule } from '../users/users.module'
import { ACCESS_TOKEN_EXPIRES } from '../../constants/common'
import { ConfigModule } from '@nestjs/config'
import { CacheModule } from '@nestjs/cache-manager'

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: config => {
        if (!config.JWT_SECRET) {
          throw new Error('JWT_SECRET is not defined')
        }
        return config
      },
    }),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    UserModule,
    CacheModule.register({
      ttl: 300, // 5 minutes
      max: 100, // 100 requests
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SteamStrategy],
})
export class AuthModule {}
