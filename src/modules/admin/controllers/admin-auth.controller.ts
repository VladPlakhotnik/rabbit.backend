import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Throttle } from '@nestjs/throttler'
import { Request, Response } from 'express'
import {
  COOKIE_NAME,
  COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
  isProduction,
} from '../admin.config'
import { LoginDto } from '../dto/login.dto'
import { AdminAuthService } from '../services/admin-auth.service'
import { getClientIp, getUserAgent } from '../../../common/helpers/request-meta'

const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JS can't read it → XSS can't exfiltrate
    secure: isProduction(), // HTTPS-only in prod (browser refuses on HTTP localhost dev)
    sameSite: 'strict', // CSRF defense — never sent on cross-site requests
    path: COOKIE_PATH, // browser only sends it to /admin/auth/*
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  })
}

const clearRefreshCookie = (res: Response): void => {
  // Clearing must use the same path the cookie was set with, otherwise
  // the browser won't know which cookie to delete.
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH })
}

// IP / UA helpers live in src/common/helpers/request-meta.ts so the
// game-user auth controller can share them without duplicating the
// `x-forwarded-for` parsing / UA-truncation rules.

@Controller('admin/auth')
@UseGuards(ThrottlerGuard)
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  // 5 attempts / 60 seconds / IP — slows down brute-force without
  // blocking legitimate retries. Per-account lockout (5 fails →
  // 15 min) is the second layer, in AdminAuthService.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto,
      getClientIp(req),
      getUserAgent(req),
    )
    setRefreshCookie(res, result.refresh_token)
    return {
      access_token: result.access_token,
      admin: result.admin,
    }
  }

  // Refresh runs lighter throttle — clients legitimately call this
  // every 15 minutes (token TTL).
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined
    if (!token) {
      // Don't leak whether the cookie was missing vs invalid — both
      // get the same response.
      throw new UnauthorizedException('Invalid refresh token')
    }
    const result = await this.auth.refresh(
      token,
      getClientIp(req),
      getUserAgent(req),
    )
    setRefreshCookie(res, result.refresh_token)
    return {
      access_token: result.access_token,
      admin: result.admin,
    }
  }

  // Logout always succeeds from the client's POV. Server best-efforts
  // the revoke; client just wipes its access token + state regardless.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined
    await this.auth.logout(token ?? null)
    clearRefreshCookie(res)
  }
}
