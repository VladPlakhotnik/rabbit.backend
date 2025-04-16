import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { UserService } from '../users/users.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @ApiOperation({ summary: 'Steam login' })
  @ApiResponse({ status: 200, description: 'Steam login successful' })
  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  steamLogin() {}

  @ApiOperation({ summary: 'Google login' })
  @ApiResponse({ status: 200, description: 'Google login successful' })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @ApiOperation({ summary: 'Steam login callback' })
  @ApiResponse({ status: 200, description: 'Steam login callback successful' })
  @Get('steam/return')
  @UseGuards(AuthGuard('steam'))
  async steamLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const steamUser = req.user

      if (!steamUser) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      const user =
        (await this.userService.findBySteamId(steamUser.steam_id)) ||
        (await this.userService.create({
          steam_id: steamUser.steam_id,
          display_name: steamUser.display_name ?? '',
          avatar: steamUser.avatar ?? '',
          profile_url: steamUser.profile_url ?? '',
          role: 'user',
          balance: 0,
          trade_link: null,
          referral_parent_id: null,
          opened_cases: 0,
          upgraded_skins: 0,
          deposit_amount: 0,
          withdrawal_amount: 0,
          rank: 'initiate_1',
          created_at: new Date(),
        }))

      const token = await this.authService.login(user)

      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/callback?token=${token.accessToken}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Authentication error: ${message}`)
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
    }
  }

  @ApiOperation({ summary: 'Google login callback' })
  @ApiResponse({ status: 200, description: 'Google login callback successful' })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleLoginCallback(@Req() req: Request, @Res() res: Response) {
    // try {
    //   const googleUser = req.user
    //   if (!googleUser) {
    //     throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    //   }
    //   const user =
    //     (await this.userService.findByGoogleId(googleUser.google_id)) ||
    //     (await this.userService.create({
    //       google_id: googleUser.google_id,
    //       email: googleUser.email,
    //       display_name: googleUser.display_name,
    //       avatar: googleUser.avatar,
    //       role: 'user',
    //       balance: 0,
    //       trade_link: null,
    //       referral_parent_id: null,
    //       opened_cases: 0,
    //       upgraded_skins: 0,
    //       deposit_amount: 0,
    //       withdrawal_amount: 0,
    //       rank: 'initiate_1',
    //       created_at: new Date(),
    //     }))
    //   const token = await this.authService.login(user)
    //   return res.redirect(
    //     `${process.env.FRONTEND_URL}/auth/callback?token=${token.accessToken}`,
    //   )
    // } catch (error) {
    //   const message = error instanceof Error ? error.message : 'Unknown error'
    //   this.logger.error(`Google authentication error: ${message}`)
    //   return res.redirect(`${process.env.FRONTEND_URL}/auth/error`)
    // }
  }
}
