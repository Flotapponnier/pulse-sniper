import { config } from '../config.js';
import type { PulseTokenRow } from './types.js';

export type QualityResult =
  | { ok: true; score: number }
  | { ok: false; reason: string };

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Defensive client-side check on top of server-side filters, plus a 0-100
 * score combining holdings concentration, liquidity, holders and trending.
 */
export function evaluate(t: PulseTokenRow): QualityResult {
  if (!t || !t.address || !t.chainId) {
    return { ok: false, reason: 'missing core fields' };
  }
  if (!t.symbol || t.symbol.trim() === '') {
    return { ok: false, reason: 'missing symbol' };
  }

  if (t.is_spam === true) return { ok: false, reason: 'flagged spam' };

  const createdMs = toMs(t.createdAt);
  if (createdMs === null) {
    return { ok: false, reason: 'invalid createdAt' };
  }
  const ageSec = (Date.now() - createdMs) / 1000;
  if (ageSec > config.maxAgeSeconds) {
    return { ok: false, reason: `too old (${Math.round(ageSec)}s)` };
  }
  if (ageSec < -10) {
    return { ok: false, reason: 'createdAt in the future' };
  }

  if (t.bonded === true) return { ok: false, reason: 'already bonded' };

  const liquidity = t.liquidity ?? 0;
  if (liquidity < config.minLiquidityUsd) {
    return { ok: false, reason: `low liquidity ${liquidity}` };
  }

  const dev = t.devHoldings ?? 0;
  if (dev > config.maxDevHoldings) return { ok: false, reason: `dev ${dev}%` };

  const snipers = t.snipersHoldings ?? 0;
  if (snipers > config.maxSnipersHoldings) {
    return { ok: false, reason: `snipers ${snipers}%` };
  }

  const top10 = t.top10Holdings ?? 0;
  if (top10 > config.maxTop10Holdings) {
    return { ok: false, reason: `top10 ${top10}%` };
  }

  // Score
  let score = 50;

  const holders = t.holdersCount ?? 0;
  if (holders > 100) score += 15;
  else if (holders > 30) score += 8;
  else if (holders > 10) score += 4;

  if (dev < 5) score += 10;
  if (snipers < 5) score += 10;
  if (top10 < 30) score += 10;
  else if (top10 < 50) score += 5;

  const liqRatio = (t.liquidityMax ?? liquidity) / Math.max(liquidity, 1);
  if (liqRatio > 1.5) score += 5; // pool growing

  if ((t.bondingPercentage ?? 0) > 20) score += 5;
  if ((t.proTradersCount ?? 0) > 5) score += 5;
  if ((t.trendingScore1min ?? 0) > 0) score += 5;

  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return { ok: true, score };
}
