import type { QuoteResponse } from '@/types/provider'

/**
 * Quote ranking — pure, no provider/SDK imports (so it is unit-testable offline).
 *
 * Why this exists: ranking quotes by raw `BigInt(toAmount)` is unsafe because
 * providers disagree on the destination token's decimals (e.g. Symbiosis/Rubic
 * mislabel 6-decimal USDC as 18). Comparing raw integers across mismatched
 * decimals can rank a dust-output route as "best". Instead we:
 *   1. normalize each quote's output to human units using its declared decimals,
 *   2. distrust any quote whose decimals disagree with the cross-provider
 *      consensus (the destination token is the same for every quote in a request),
 *   3. subtract clearly on-top fees (FeeCost.included === false),
 *   4. break near-ties with a fee/speed/reliability score.
 */

const PROVIDER_RELIABILITY: Record<string, number> = {
  cctp: 98,
  lifi: 95,
  rango: 90,
  symbiosis: 88,
  rubic: 85,
  'near-intents': 80,
}

// Net outputs within this relative gap are treated as a tie → use the score.
const TIE_EPSILON = 1e-6

/** Destination-token decimals a quote declares (top-level field wins, else route token). */
export function declaredDecimals(quote: QuoteResponse): number {
  if (typeof quote.toTokenDecimals === 'number') return quote.toTokenDecimals
  const routeDec = quote.routes?.[0]?.action?.toToken?.decimals
  if (typeof routeDec === 'number') return routeDec
  return 18
}

/**
 * The decimals the majority of quotes agree on for the (shared) destination
 * token. Returns undefined if there are no quotes. Ties broken toward the
 * smaller value (conservative).
 */
export function consensusDecimals(quotes: QuoteResponse[]): number | undefined {
  if (quotes.length === 0) return undefined
  const counts = new Map<number, number>()
  for (const q of quotes) {
    const d = declaredDecimals(q)
    counts.set(d, (counts.get(d) || 0) + 1)
  }
  let best: number | undefined
  let bestCount = -1
  for (const [dec, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === undefined || dec < best))) {
      best = dec
      bestCount = count
    }
  }
  return best
}

/** Sum of on-top fee costs (included === false) in USD across a quote's routes. */
export function onTopCostUSD(quote: QuoteResponse): number {
  let total = 0
  for (const route of quote.routes || []) {
    for (const fee of route.estimate?.feeCosts || []) {
      if (fee.included === false) total += parseFloat(fee.amountUSD || '0') || 0
    }
  }
  return total
}

/**
 * Net output of a quote in human units of the destination token, minus on-top
 * costs. `decimals` is the canonical decimals to normalize by (the consensus for
 * trusted quotes; the quote's own for untrusted).
 */
export function netOutput(quote: QuoteResponse, decimals: number): number {
  const raw = Number(quote.toAmount || '0')
  const human = raw / Math.pow(10, decimals)
  return human - onTopCostUSD(quote)
}

/** Tie-breaker when net outputs are within epsilon. Higher = better. */
export function tieBreakerScore(quote: QuoteResponse): number {
  const totalFeeUSD = parseFloat(quote.fees?.totalFeeUSD || '0') || 0
  const duration = quote.estimatedDuration && quote.estimatedDuration > 0 ? quote.estimatedDuration : 600
  const reliability = PROVIDER_RELIABILITY[quote.provider] || 50

  const feeScore = Math.max(0, 30 * (1 - Math.min(totalFeeUSD, 30) / 30))
  const speedScore = Math.max(0, 10 * (1 - Math.min(duration, 1800) / 1800))
  const reliabilityScore = (reliability / 100) * 10

  return feeScore + speedScore + reliabilityScore
}

/**
 * Rank quotes best-first. Quotes whose declared decimals match the consensus are
 * "trusted" and always rank above "untrusted" (mismatched-decimals) quotes,
 * regardless of raw amount — a mislabeled quote can never win. Within each group,
 * sort by net output desc, breaking near-ties with the tie-breaker score.
 */
export function rankQuotes(quotes: QuoteResponse[]): QuoteResponse[] {
  if (quotes.length <= 1) return [...quotes]
  const consensus = consensusDecimals(quotes)

  const decimalsFor = (q: QuoteResponse) => declaredDecimals(q)
  const isTrusted = (q: QuoteResponse) => consensus === undefined || decimalsFor(q) === consensus
  // Trusted quotes normalize by the consensus; untrusted by their own (best effort).
  const netFor = (q: QuoteResponse) => netOutput(q, isTrusted(q) ? (consensus as number) : decimalsFor(q))

  return [...quotes].sort((a, b) => {
    const ta = isTrusted(a)
    const tb = isTrusted(b)
    if (ta !== tb) return ta ? -1 : 1 // trusted before untrusted

    const na = netFor(a)
    const nb = netFor(b)
    const denom = Math.max(1, Math.abs(na), Math.abs(nb))
    if (Math.abs(na - nb) / denom > TIE_EPSILON) {
      return nb - na // higher net output first
    }
    return tieBreakerScore(b) - tieBreakerScore(a) // near-tie → score
  })
}
