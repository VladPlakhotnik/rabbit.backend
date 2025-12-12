export interface DMarketSkinInfo {
  itemId: string
  type: string
  amount: number
  classId: string
  gameId: string
  gameType: string
  inMarket: boolean
  lockStatus: boolean
  title: string
  description: string
  image: string
  slug: string
  owner: string
  ownersBlockchainId: string
  ownerDetails: {
    id: string
    avatar: string
    wallet: string
  }
  status: string
  discount: number
  price: {
    DMC: string
    USD: string
  }
  instantPrice: {
    DMC: string
    USD: string
  }
  exchangePrice: {
    DMC: string
    USD: string
  }
  instantTargetId: string
  suggestedPrice: {
    DMC: string
    USD: string
  }
  recommendedPrice: {
    offerPrice: {
      DMC: string
      USD: string
    }
    d3: {
      DMC: string
      USD: string
    }
    d7: {
      DMC: string
      USD: string
    }
    d7Plus: {
      DMC: string
      USD: string
    }
  }
  extra: {
    nameColor: string
    backgroundColor: string
    tradable: boolean
    offerId: string
    isNew: boolean
    gameId: string
    name: string
    categoryPath: string
    viewAtSteam: string
    groupId: string
    withdrawable: boolean
    linkId: string
    exterior: string
    quality: string
    category: string
    tradeLockDuration: number
    settlementTime: string
    settlementDuration: number
    itemType: string
    floatValue: number
    floatPartValue: string
    paintIndex: number
    paintSeed: number
    inspectInGame: string
    collection: string[]
    saleRestricted: boolean
    inGameAssetID: string
    emissionSerial: string
    sagaAddress: string
  }
  createdAt: number
  deliveryStats: {
    rate: string
    time: string
  }
  fees: {
    f2f: {
      sell: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
      instantSell: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
      exchange: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
    }
    dmarket: {
      sell: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
      instantSell: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
      exchange: {
        default: {
          percentage: string
          minFee: {
            DMC: string
            USD: string
          }
        }
      }
    }
  }
  discountPrice: {
    DMC: string
    USD: string
  }
  productId: string
  favoriteFor: number
  favoriteForUser: boolean
  favorite: {
    count: number
    forUser: boolean
  }
}

export interface DMarketApiResponse {
  objects: DMarketSkinInfo[]
  cursor: string | null
  total?: number
}

export interface SyncResult {
  success: boolean
  updated: number
  errors: number
  pagesProcessed: number
  lastCursor?: string
  totalTime?: number
}

export interface RateLimitInfo {
  maxRequestsPerMinute: number
  requestsInLastMinute: number
  requestDelay: number
  minDelayBetweenRequests: number
  timeSinceLastRequest: number
}

export interface BatchUpdateResult {
  updated: number
  errors: number
  processed: number
}

export interface SkinUpdateData {
  id: number
  image?: string
  name?: string
  inspect_in_game?: string
  quality?: string
  exterior?: string
  category?: string
  slug?: string
  name_color?: string
  background_color?: string
  item_type?: string
  collection?: string[]
  float_value?: number
  float_part_value?: string
  pattern?: number
}
