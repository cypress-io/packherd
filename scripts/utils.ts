export function threeDecimals(n: number) {
  return Math.round(n * 1000) / 1000
}

export function byDurationReversed(
  { duration: dur1 }: { duration: number },
  { duration: dur2 }: { duration: number }
) {
  return dur1 <= dur2 ? 1 : -1
}
