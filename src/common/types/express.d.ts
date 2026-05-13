import { User } from '../../modules/users/user.entity'

declare global {
  namespace Express {
    interface User {
      id: number
      steam_id: number | null
      display_name: string
      avatar: string
      profile_url: string
      role: string
      balance: number
      trade_link: string | null
      referral_parent_id: number | null
      created_at: Date
      opened_cases: number
      upgraded_skins: number
      deposit_amount: number
      vip_qualifying_volume: number
      vip_xp: number
      vip_theoretical_rake: number
      withdrawal_amount: number
    }

    interface Request {
      user?: User
    }
  }
}
