import {
  BotProfileSnapshot,
  pickBotStake,
  pickCrashCashoutTarget,
  roundBotMoney,
} from '../bots/bot-behavior.logic'
import {
  CRASH_LIVE_MAX_BOTS,
  CRASH_LIVE_MIN_BOTS,
} from './crash-live.constants'

export type CrashLivePhase = 'waiting' | 'running' | 'crashed'
export type CrashLiveParticipantStatus = 'active' | 'cashed_out' | 'crashed'

export interface CrashLiveParticipant {
  id: string
  owner: 'bot'
  userId: number
  playerName: string
  avatar: string | null
  slot: number
  stake: number
  mode: 'balance'
  joinOffsetMs: number
  status: CrashLiveParticipantStatus
  targetMultiplier: number
  cashoutMultiplier?: number
  payout: number
  profit: number
}

export interface BuildCrashBotParticipantOptions {
  profile: BotProfileSnapshot
  roundId: number
  slot: number
  random?: () => number
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const pickCrashParticipantCount = (
  random: () => number = Math.random,
): number => {
  const tierRoll = random()

  if (tierRoll < 0.12) {
    return CRASH_LIVE_MIN_BOTS + Math.floor(random() * 3)
  }

  if (tierRoll < 0.72) {
    return 6 + Math.floor(random() * 7)
  }

  if (tierRoll < 0.94) {
    return 13 + Math.floor(random() * 5)
  }

  return CRASH_LIVE_MAX_BOTS - 2 + Math.floor(random() * 3)
}

export const getCrashRoundMultiplier = (elapsedMs: number): number => {
  const elapsedSeconds = Math.max(0, elapsedMs) / 1000
  const multiplier =
    1 + elapsedSeconds * 0.045 + Math.pow(elapsedSeconds, 1.75) * 0.0065

  return Math.max(1, roundBotMoney(multiplier))
}

export const generateCrashPoint = (
  random: () => number = Math.random,
): number => {
  const earlyCrash = random() < 0.13

  if (earlyCrash) {
    return roundBotMoney(1 + random() * 0.35)
  }

  return roundBotMoney(1.25 + Math.pow(random(), 2.1) * 9 + random() * 1.2)
}

export const buildCrashBotParticipant = ({
  profile,
  roundId,
  slot,
  random = Math.random,
}: BuildCrashBotParticipantOptions): CrashLiveParticipant => {
  const stake = pickBotStake(profile, 'crash', random)
  const targetMultiplier = pickCrashCashoutTarget(profile, stake, random)

  return {
    id: `bot-${roundId}-${profile.id}-${slot}`,
    owner: 'bot',
    userId: profile.id,
    playerName: profile.display_name,
    avatar: profile.avatar,
    slot,
    stake,
    mode: 'balance',
    joinOffsetMs: 0,
    status: 'active',
    targetMultiplier,
    payout: 0,
    profit: 0,
  }
}

export const scheduleCrashParticipantJoins = (
  participants: readonly CrashLiveParticipant[],
  waitMs: number,
  random: () => number = Math.random,
): CrashLiveParticipant[] => {
  const count = Math.max(1, participants.length)
  const earliestJoinMs = Math.min(600, Math.max(200, waitMs * 0.04))
  const latestJoinMs = Math.max(earliestJoinMs, waitMs - 700)
  const waveCount = Math.min(
    count,
    Math.max(2, 3 + Math.floor(random() * Math.min(5, count))),
  )
  const waveAnchors = Array.from({ length: waveCount }, (_, index) => {
    const progress = (index + random() * 0.75) / waveCount
    const easedProgress = Math.pow(clampNumber(progress, 0, 1), 1.18)

    return Math.round(
      clampNumber(
        earliestJoinMs + easedProgress * (latestJoinMs - earliestJoinMs),
        earliestJoinMs,
        latestJoinMs,
      ),
    )
  }).sort((a, b) => a - b)

  return participants.map(participant => {
    const waveIndex = Math.min(
      waveAnchors.length - 1,
      Math.floor(random() * waveAnchors.length),
    )
    const hasMicroJitter = random() < 0.32
    const jitter = hasMicroJitter ? Math.round((random() - 0.5) * 420) : 0
    const joinOffsetMs = Math.round(
      clampNumber(waveAnchors[waveIndex] + jitter, earliestJoinMs, latestJoinMs),
    )

    return {
      ...participant,
      joinOffsetMs,
    }
  })
}

export const getVisibleCrashParticipants = (
  participants: readonly CrashLiveParticipant[],
  elapsedMs: number,
  phase: CrashLivePhase,
): CrashLiveParticipant[] => {
  if (phase !== 'waiting') {
    return [...participants]
  }

  return participants.filter(participant => participant.joinOffsetMs <= elapsedMs)
}

export const settleCrashParticipants = (
  participants: readonly CrashLiveParticipant[],
  crashMultiplier: number,
): CrashLiveParticipant[] =>
  participants.map(participant => {
    if (participant.status !== 'active') {
      return participant
    }

    if (participant.targetMultiplier <= crashMultiplier) {
      const payout = roundBotMoney(
        participant.stake * participant.targetMultiplier,
      )

      return {
        ...participant,
        status: 'cashed_out',
        cashoutMultiplier: participant.targetMultiplier,
        payout,
        profit: roundBotMoney(payout - participant.stake),
      }
    }

    return {
      ...participant,
      status: 'crashed',
      payout: 0,
      profit: -participant.stake,
    }
  })

export const cashOutDueParticipants = (
  participants: readonly CrashLiveParticipant[],
  currentMultiplier: number,
): CrashLiveParticipant[] =>
  participants.map(participant => {
    if (
      participant.status !== 'active' ||
      participant.targetMultiplier > currentMultiplier
    ) {
      return participant
    }

    const payout = roundBotMoney(participant.stake * participant.targetMultiplier)

    return {
      ...participant,
      status: 'cashed_out',
      cashoutMultiplier: participant.targetMultiplier,
      payout,
      profit: roundBotMoney(payout - participant.stake),
    }
  })
