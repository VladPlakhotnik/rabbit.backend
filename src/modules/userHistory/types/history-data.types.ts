import { HistoryAction } from '../enums/history-action.enum'

// Cases
export interface OpenCaseData {
  caseId: number
  caseName: string
  casePrice: number
  skinId?: number
  skinName?: string
  skinRarity?: string
  skinPrice?: number
}

export interface OpenClickerCaseData {
  caseId: number
  caseName: string
  casePrice?: number
  skinId?: number
  skinName?: string
  skinRarity?: string
  skinPrice?: number
}

// Upgrade
export interface UpgradeSkinData {
  skinId: number
  skinName: string
  oldRarity: string
  newRarity: string
  cost: number
}

export interface ClickerUpgradeData {
  upgradeType: 'click_level' | 'energy_level'
  oldLevel: number
  newLevel: number
  cost: number
}

// Mines
export interface MinesGameData {
  betAmount: number
  multiplier: number
  profit: number
  minesCount: number
  revealedPositions: number[]
  gameResult: 'win' | 'lose'
}

// Other actions
export interface DepositData {
  amount: number
  method: string
  transactionId?: string
}

export interface WithdrawalData {
  amount: number
  method: string
  status: string
  transactionId?: string
}

export interface ClickerClickData {
  pointsEarned: number
  energyUsed: number
  currentLevel: number
}

export interface PromoCodeData {
  code: string
  reward: string
  rewardAmount: number
}

export interface RewardClaimData {
  rewardType: string
  rewardAmount: number
  rewardDescription: string
}

export type HistoryData =
  | { action: HistoryAction.OPEN_CASE; data: OpenCaseData }
  | { action: HistoryAction.OPEN_CLICKER_CASE; data: OpenClickerCaseData }
  | { action: HistoryAction.UPGRADE_SKIN; data: UpgradeSkinData }
  | { action: HistoryAction.CLICKER_UPGRADE; data: ClickerUpgradeData }
  | { action: HistoryAction.MINES_GAME; data: MinesGameData }
  | { action: HistoryAction.DEPOSIT; data: DepositData }
  | { action: HistoryAction.WITHDRAWAL; data: WithdrawalData }
  | { action: HistoryAction.CLICKER_CLICK; data: ClickerClickData }
  | { action: HistoryAction.PROMO_CODE_USE; data: PromoCodeData }
  | { action: HistoryAction.REWARD_CLAIM; data: RewardClaimData }
