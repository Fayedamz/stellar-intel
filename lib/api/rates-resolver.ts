import { isAnchorDegraded } from '@/lib/stellar/anchors';
import { fetchCorridorRates } from '@/lib/stellar/server-rates';
import { getCachedRate, setCachedRate, invalidateCachedRates } from '@/lib/api/rate-cache';
import { recordRatesCacheHit, recordRatesCacheMiss } from '@/lib/metrics';
import type { RateComparison } from '@/types';

export interface ResolveCorridorRatesOptions {
  /** Bypasses the shared cache and re-fetches every anchor's live rate. */
  forceRefresh?: boolean;
}

export interface ResolveCorridorRatesResult {
  comparison: RateComparison;
  /** Whether this result came from the in-process cache or a live fetch. */
  servedFromCache: boolean;
}

/**
 * Fetches a corridor's rate comparison, going through the shared in-process
 * cache first. Cached results are ignored (and invalidated) once any of their
 * anchors is flagged degraded, so REST and GraphQL never serve a comparison
 * pinned to a since-disabled anchor.
 *
 * This is the single call site for "get rates for a corridor" — REST's
 * `GET /api/rates/[corridor]` and the GraphQL `rates` query both resolve
 * through here so the two surfaces can never drift on cache/degradation
 * semantics.
 */
export async function resolveCorridorRates(
  corridor: string,
  amount: string,
  options: ResolveCorridorRatesOptions = {}
): Promise<ResolveCorridorRatesResult> {
  const { forceRefresh = false } = options;

  const cached = forceRefresh ? undefined : getCachedRate(corridor, amount);
  const hasHealthyCachedResult =
    cached !== undefined && !cached.rates.some((rate) => isAnchorDegraded(rate.anchorId));

  if (hasHealthyCachedResult) {
    recordRatesCacheHit();
    return { comparison: cached, servedFromCache: true };
  }

  recordRatesCacheMiss();
  if (cached) {
    for (const rate of cached.rates) {
      if (isAnchorDegraded(rate.anchorId)) {
        invalidateCachedRates(rate.anchorId);
      }
    }
  }

  const comparison = await fetchCorridorRates(corridor, amount);
  if (comparison.rates.length > 0) {
    setCachedRate(corridor, amount, comparison);
  }

  return { comparison, servedFromCache: false };
}
