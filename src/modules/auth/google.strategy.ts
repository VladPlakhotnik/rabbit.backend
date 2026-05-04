import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { Strategy } from 'passport-google-oauth20'
import { ERROR_MESSAGES } from '../../constants/errorMessages'

import type { GoogleAuthResult } from './types/auth.types'

interface GoogleProfile {
  id: string
  displayName?: string
  emails?: { value: string; verified?: boolean }[]
  photos?: { value: string }[]
}

/**
 * Google authentication strategy
 * @class GoogleStrategy
 * @extends {PassportStrategy}
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name)

  constructor(private readonly configService: ConfigService) {
    const baseUrl = configService.get<string>(
      'BASE_URL',
      'http://localhost:5000',
    )
    const callbackURL = `${baseUrl}/auth/google/callback`
    const clientId = configService.get<string>('GOOGLE_CLIENT_ID')
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET')

    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL,
      scope: ['profile', 'email'],
    })

    this.logger.log(`Initializing Google strategy`)
    this.logger.log(`Callback URL: ${callbackURL}`)
    this.logger.log(
      `IMPORTANT: Make sure this exact URL is added to Google Cloud Console as Authorized redirect URI`,
    )
    this.logger.log(
      `Using Google Client ID: ${clientId ? 'Present' : 'Missing'}`,
    )
  }

  /**
   * Forces Google to ALWAYS show the account picker — even when the
   * user is already signed in to Google in this browser and has
   * previously authorised this app. Without it the OAuth round-trip
   * is invisible: the user clicks "Link Google", their browser
   * silently bounces to Google and back, and the only feedback they
   * get is the success toast — making them wonder if anything
   * happened at all (and offering no way to pick which Google account
   * to attach when they have several).
   *
   * `select_account` is gentler than `consent` — Google still skips
   * the permission grant step on subsequent uses, but the picker
   * always shows so the user knows they're handing the app a Google
   * identity.
   */
  authorizationParams(): Record<string, string> {
    return { prompt: 'select_account' }
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
  ): Promise<GoogleAuthResult> {
    try {
      if (!profile || !profile.id) {
        this.logger.warn('Invalid Google profile received')
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
      }

      const email = profile.emails?.[0]?.value || ''
      if (!email) {
        this.logger.warn('Google profile missing email')
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
      }

      this.logger.log(`Google authentication successful for user ${profile.id}`)

      return {
        google_id: profile.id,
        email,
        display_name: profile.displayName || email.split('@')[0],
        avatar: profile.photos?.[0]?.value || null,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Google authentication error: ${message}`)
      throw error
    }
  }
}
