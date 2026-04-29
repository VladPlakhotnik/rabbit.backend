// Shape of a LiveDrop event flowing through Redis → gateway → client.
// Keep it flat and JSON-serialisable: it's pushed into a Redis list and
// broadcast over Socket.IO. Field names mirror the frontend's `ISkin`/`ICase`
// (snake_case for skin/case fields) so the frontend can consume the payload
// without remapping.
export interface LiveDropUser {
  id: number | null
  username: string
  avatar: string | null
}

export interface LiveDropSkin {
  id: number
  name: string
  market_hash_name: string
  image: string
  market_price: number
  quality: string
  name_color: string
  background_color: string
}

export interface LiveDropCase {
  id: number
  slug: string
  name: string
  img_url: string
}

export interface LiveDropPayload {
  id: string
  user: LiveDropUser
  skin: LiveDropSkin
  case: LiveDropCase
  isBot: boolean
  ts: number
}
