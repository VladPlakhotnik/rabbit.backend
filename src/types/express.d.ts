import { User } from "../users/users.entity";

declare global {
  namespace Express {
    interface User {
      steamid: string; // Поле 'steamid' (обязательно)
      displayname: string; // Поле 'displayname'
      avatar: string; // Поле 'avatar'
      profileurl: string; // Поле 'profileurl'
      role: string; // Поле 'role'
      balance: number; // Поле 'balance'
      tradelink: string; // Поле 'tradelink'
      referral: number; // Поле 'referral'
      created_at: Date; // Поле 'created_at'
    }

    interface Request {
      user?: User; // Используем интерфейс User
    }
  }
}
