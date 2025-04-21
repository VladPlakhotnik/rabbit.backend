export enum SkinType {
  KNIFE = 'knife',
  GLOVES = 'gloves',
  WEAPON = 'weapon',
  STICKER = 'sticker',
  CASE = 'case',
  GRAFFITI = 'graffiti',
}

export enum SkinRarity {
  CONSUMER = 'consumer',
  INDUSTRIAL = 'industrial',
  MILSPEC = 'milspec',
  RESTRICTED = 'restricted',
  CLASSIFIED = 'classified',
  COVERT = 'covert',
  RARE = 'rare',
}

export enum SkinCondition {
  FACTORY_NEW = 'factory_new',
  MINIMAL_WEAR = 'minimal_wear',
  FIELD_TESTED = 'field_tested',
  WELL_WORN = 'well_worn',
  BATTLE_SCARRED = 'battle_scarred',
}

export interface SkinExtra {
  name: string[]
  type: number
  group: number | null
  exterior: number | null
  rarity: number
  souvenir: boolean
  stattrak: boolean
}

export interface Skin {
  id: number
  appId: number
  marketName: string
  stock: number
  priceUsd: string
  extra: SkinExtra
}

export interface SkinResponse {
  items: Skin[]
  count: number
  updatedAt: number
}
