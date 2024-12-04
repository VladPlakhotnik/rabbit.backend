import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { UserService } from '../users/users.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  steamLogin() {
    // Перенаправляет на страницу авторизации Steam
  }

  @Get('steam/return')
  @UseGuards(AuthGuard('steam'))
  async steamLoginCallback(@Req() req: Request, @Res() res: Response) {
    const steamUser = req.user

    if (!steamUser) {
      throw new UnauthorizedException('Authentication failed')
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

    return res.redirect(`http://localhost:3000/auth/callback?token=${token}`)
  }

  // private isTrustedRedirectUrl(url: string): boolean {
  //   const trustedHostnames = ['droplock-frontend.vercel.app']
  //   try {
  //     const hostname = new URL(url).hostname
  //     console.log(hostname)
  //     return trustedHostnames.includes(hostname)
  //   } catch {
  //     return false
  //   }
  // }
}
