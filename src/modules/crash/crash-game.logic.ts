export const roundCrashMoney = (value: number): number =>
  Math.round(value * 100) / 100

export const splitCrashStake = (
  totalStake: number,
  betCount: 1 | 2,
): number[] => {
  const normalizedTotal = roundCrashMoney(totalStake)

  if (betCount === 1) {
    return [normalizedTotal]
  }

  const firstStake = roundCrashMoney(normalizedTotal / 2)

  return [firstStake, roundCrashMoney(normalizedTotal - firstStake)]
}

export const calculateCrashPayout = (
  stake: number,
  multiplier: number,
): number => roundCrashMoney(stake * Math.max(1, multiplier))
