import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TelegramService } from './services/telegram.service'
import { DiscordService } from './services/discord.service'

/**
 * Module for social platform integrations
 * Supports Telegram, Discord, and other social platforms
 */
@Module({
  imports: [HttpModule],
  providers: [TelegramService, DiscordService],
  exports: [TelegramService, DiscordService],
})
export class SocialModule {}
