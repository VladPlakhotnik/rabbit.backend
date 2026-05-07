import type {
  CrashLiveParticipant,
  CrashLivePhase,
} from './crash-live.logic'

export interface CrashLiveSnapshot {
  roundId: number
  phase: CrashLivePhase
  currentMultiplier: number
  countdownMs: number
  crashPoint: number | null
  participants: CrashLiveParticipant[]
  roundHistory: number[]
  pot: number
  participantCount: number
  serverTime: number
}

export type CrashLiveStateHandler = (snapshot: CrashLiveSnapshot) => void
