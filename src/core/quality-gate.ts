import { config } from '../config.js';
import type { PulseTokenData } from './types.js';

export type QualityResult =
  | { ok: true; score: number }
  | { ok: false; reason: string };

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Defensive double-check: even though the server pre-filters on the same
 * thresholds, networks/race conditions can deliver stale rows. We bail on
 * anything that looks unsafe and otherwise score the token 0–100.
 */
export function evaluate(payload: PulseTokenData): QualityResult {
  const t = payload.token;
  if (!t || !t.address || !t.chainId) {
    return { ok: false, reason: 'missing core fields' };
  }
  if (!t.symbol || t.symbol.trim() === '') {
    return { ok: false, reason: 'missing symbol' };
  }

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

  if (t.bonded === true) {
    return { ok: false, reason: 'already bonded' };
  }

  const liquidity = t.liquidity ?? 0;
  if (liquidity < config.minLiquidityUsd) {
    return { ok: false, reason: `low liquidity ${liquidity}` };
  }

  if ((t.devHoldingsPercentage ?? 0) > config.maxDevHoldings) {
    return { ok: false, reason: 'dev holdings too high' };
  }
  if ((t.snipersHoldingsPercentage ?? 0) > config.maxSnipersHoldings) {
    return { ok: false, reason: 'snipers too high' };
  }
  if ((t.top10HoldingsPercentage ?? 0) > config.maxTop10Holdings) {
    return { ok: false, reason: 'top10 too high' };
  }

  const sec = payload.security ?? {};
  if (sec.isBlacklisted) return { ok: false, reason: 'blacklisted' };
  if (sec.isHoneypot) return { ok: false, reason: 'honeypot' };
  if ((sec.buyTax ?? 0) > config.maxBuyTax) {
    return { ok: false, reason: 'buy tax too high' };
  }
  if ((sec.sellTax ?? 0) > config.maxSellTax) {
    return { ok: false, reason: 'sell tax too high' };
  }

  let score = 50;
  const holders = t.holdersCount ?? 0;
  if (holders > 100) score += 10;
  else if (holders > 30) score += 5;

  const socials = payload.socials ?? {};
  if (socials.twitter) score += 10;
  if (socials.telegram) score += 5;
  if (socials.website) score += 5;

  if (payload.dexscreenerListed) score += 5;
  if (sec.noMintAuthority) score += 10;

  if ((t.devHoldingsPercentage ?? 100) < 5) score += 5;
  if ((t.snipersHoldingsPercentage ?? 100) < 5) score += 5;

  if ((payload.organic_trades_5min ?? 0) > 10) score += 5;

  if (score > 100) score = 100;
  return { ok: true, score };
}
