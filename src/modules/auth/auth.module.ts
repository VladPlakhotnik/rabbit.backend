import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { CacheModule } from '@nestjs/cache-manager'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { SteamStrategy } from './steam.strategy'
import { TelegramStrategy } from './telegram.strategy'
import { GoogleStrategy } from './google.strategy'
import { UserModule } from '../users/users.module'
import { ClickerUserModule } from '../clickerUser/clicker-user.module'
import { SocialModule } from '../social/social.module'

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
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    UserModule,
    ClickerUserModule,
    SocialModule,
    CacheModule.register({
      ttl: 300, // 5 minutes
      max: 100, // 100 requests
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SteamStrategy,
    TelegramStrategy,
    GoogleStrategy,
  ],
})
export class AuthModule {}
