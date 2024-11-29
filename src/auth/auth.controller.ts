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

    // Проверяем пользователя в базе данных
    // Find or create user in database
    const user =
      (await this.userService.findBySteamId(steamUser.steamid)) ||
      (await this.userService.create({
        steamid: steamUser.steamid,
        displayname: steamUser.displayname || '',
        avatar: steamUser.avatar || '',
        profileurl: steamUser.profileurl || '',
        role: steamUser.role || 'user',
        balance: steamUser.balance ?? 0,
        tradelink: steamUser.tradelink || '',
        referral: steamUser.referral ?? 0,
        created_at: new Date(),
      }))

    // Генерируем JWT-токен
    const token = await this.authService.login(user)

    // Получаем redirectUrl из query-параметров
    const redirectUrl = req.query.redirectUrl as string

    if (!redirectUrl || !this.isTrustedRedirectUrl(redirectUrl)) {
      return res.redirect(`http://localhost:3000/auth/callback?token=${token}`)
    }

    return res.redirect(`${redirectUrl}/auth/callback?token=${token}`)
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: Request) {
    return req.user
  }

  private isTrustedRedirectUrl(url: string): boolean {
    const trustedDomains = ['https://droplock-frontend.vercel.app/']
    try {
      const hostname = new URL(url).hostname
      return trustedDomains.includes(hostname)
    } catch {
      return false
    }
  }
}
