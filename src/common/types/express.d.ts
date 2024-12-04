import { User } from '../../modules/users/user.entity'

declare global {
  namespace Express {
    interface User {
      id: number
      steam_id: number // Поле 'steam_id' (обязательно)
      display_name: string // Поле 'display_name'
      avatar: string // Поле 'avatar'
      profile_url: string // Поле 'profile_url'
      role: string // Поле 'role'
      balance: number // Поле 'balance'
      trade_link: string | null // Поле 'trade_link'
      referral_parent_id: number | null // Поле 'referral_parent_id'
      created_at: Date // Поле 'created_at'
      opened_cases: number // Поле 'opened_cases'
      upgraded_skins: number // Поле 'upgraded_skins'
      deposit_amount: number // Поле 'deposit_amount'
      withdrawal_amount: number // Поле 'withdrawal_amount'
      rank: string // Поле 'rank'
    }

    interface Request {
      user?: User // Используем интерфейс User
    }
  }
}
