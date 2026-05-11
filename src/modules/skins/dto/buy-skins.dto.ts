import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt } from 'class-validator'

export const MAX_SKINS_PER_PURCHASE = 20

export class BuySkinsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SKINS_PER_PURCHASE)
  @IsInt({ each: true })
  skin_ids!: number[]

  @IsIn(['csgo', 'dota'])
  game_type!: 'csgo' | 'dota'
}
