import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-steam";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, "steam") {
  constructor(private readonly configService: ConfigService) {
    super({
      returnURL: `${configService.get<string>("BASE_URL")}/auth/steam/return`,
      realm: configService.get<string>("BASE_URL"),
      apiKey: configService.get<string>("STEAM_API_KEY"),
    });
  }

  async validate(identifier: string, profile: any) {
    return {
      steamid: profile.id, // Соответствует `steamid` в сущности `User`
      displayname: profile.displayName, // Соответствует `displayname`
      avatar: profile.photos?.[2]?.value || null, // Соответствует `avatar`
      profileurl: profile._json.profileurl || null, // Дополнительно вытаскиваем `profileurl`
      role: "user", // Значение по умолчанию
      balance: 0, // Значение по умолчанию
      tradelink: null, // Пока пустое
      referral: null, // Пока пустое
      created_at: new Date(), // Устанавливаем текущее время
    };
  }
}
