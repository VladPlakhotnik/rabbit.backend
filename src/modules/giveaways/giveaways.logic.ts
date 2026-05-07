export const pickGiveawayWinnerId = (
  participantIds: number[],
  random: () => number = Math.random,
): number | null => {
  if (participantIds.length === 0) {
    return null
  }

  const index = Math.min(
    participantIds.length - 1,
    Math.floor(random() * participantIds.length),
  )

  return participantIds[index] ?? null
}
