import type { PublicMinesSession } from '../mines.service'

export interface MinesLiveDropUser {
  id: number | null
  username: string
  avatar: string | null
}

export interface MinesLiveDropPayload {
  id: string
  user: MinesLiveDropUser
  session: PublicMinesSession
  multiplier: number
  profit: number
  isBot: boolean
  ts: number
}
