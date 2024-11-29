import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { UserService } from "../users/users.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService
  ) {}

  @Get("steam")
  @UseGuards(AuthGuard("steam"))
  steamLogin() {
    // Перенаправляет на страницу авторизации Steam
  }

  @Get("steam/return")
  @UseGuards(AuthGuard("steam"))
  async steamLoginCallback(@Req() req: Request) {
    const steamUser = req.user;

    if (!steamUser) {
      throw new Error("Steam user is undefined. Authentication failed.");
    }

    // Проверяем пользователя в базе данных
    let user = await this.userService.findBySteamId(steamUser.steamid);

    if (!user) {
      // Создаём нового пользователя
      user = await this.userService.create({
        steamid: steamUser.steamid, // Приводим к строке
        displayname: steamUser.displayname || "", // Приводим к строке
        avatar: steamUser.avatar || "", // Приводим к строке
        profileurl: steamUser.profileurl || "", // Приводим к строке
        role: steamUser.role || "user", // Роль по умолчанию
        balance: steamUser.balance ?? 0, // Баланс по умолчанию
        tradelink: steamUser.tradelink || "", // Приводим к строке
        referral: steamUser.referral ?? 0, // Приводим к числу
        created_at: new Date(), // Устанавливаем текущее время
      });
      console.log("New user");
    } else {
      console.log("User found");
    }

    // Генерируем JWT-токен
    const token = await this.authService.login(user);

    // Возвращаем токен клиенту
    return {
      message: "Authentication successful",
      token,
      user,
    };
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  getProfile(@Req() req: Request) {
    return req.user;
  }
}
