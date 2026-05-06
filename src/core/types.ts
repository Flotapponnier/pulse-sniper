/**
 * Pulse Stream V2 — flat token row as it actually appears on the wire.
 * Captured from a live `init` snapshot on solana:solana / pumpfun.
 */
export interface PulseTokenRow {
  address: string;
  chainId: string;
  symbol?: string | null;
  name?: string | null;
  decimals?: number | null;
  logo?: string | null;

  price?: number | null;
  marketCap?: number | null;
  marketCapDiluted?: number | null;

  liquidity?: number | null;
  liquidityMax?: number | null;
  bonded?: boolean | null;
  bondingPercentage?: number | null;

  poolAddress?: string | null;
  deployer?: string | null;
  createdAt?: string | number | Date | null;

  holdersCount?: number | null;

  // holdings %
  devHoldings?: number | null;
  insidersHoldings?: number | null;
  bundlersHoldings?: number | null;
  snipersHoldings?: number | null;
  proTradersHoldings?: number | null;
  freshTradersHoldings?: number | null;
  smartTradersHoldingsPercentage?: number | null;
  lpHoldingsPercentage?: number | null;
  contractHoldingsPercentage?: number | null;

  top10Holdings?: number | null;
  top50Holdings?: number | null;
  top100Holdings?: number | null;
  top200Holdings?: number | null;

  // counts
  snipersCount?: number | null;
  insidersCount?: number | null;
  bundlersCount?: number | null;
  freshTradersCount?: number | null;
  proTradersCount?: number | null;
  smartTradersCount?: number | null;

  source?: string | null;
  exchange?: { name?: string | null; logo?: string | null } | null;
  sourceMetadata?: { name?: string | null; logo?: string | null } | null;

  trendingScore1min?: number | null;
  trendingScore5min?: number | null;
  trendingScore15min?: number | null;
  trendingScore1h?: number | null;

  is_spam?: boolean | null;
  spam_checked?: boolean | null;

  totalFeesPaidUSD?: number | null;
  bonded_at?: string | null;
}

export type PulseEventType = 'init' | 'sync' | 'new-token' | 'update-token' | 'remove-token';
