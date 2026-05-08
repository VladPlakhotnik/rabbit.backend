export const UPGRADE_HOUSE_RETURN = 0.96

export const roundUpgradeChance = (value: number): number =>
  Math.round(value * 100) / 100

export const calculateUpgradeChanceByPrice = (
  usedPrice: number,
  targetPrice: number,
): number => {
  if (usedPrice <= 0 || targetPrice <= 0) {
    return 0
  }

  return roundUpgradeChance((usedPrice / targetPrice) * 100 * UPGRADE_HOUSE_RETURN)
}
