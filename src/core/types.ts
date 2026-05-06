/**
 * Subset of the Pulse Stream V2 token payload that we actually consume.
 * Other fields exist on the wire but are ignored intentionally.
 */
export interface PulseExchange {
  name?: string | null;
  logo?: string | null;
}

export interface PulseToken {
  address: string;
  chainId: string;
  symbol?: string | null;
  name?: string | null;
  logo?: string | null;
  decimals?: number | null;
  price?: number | null;
  marketCap?: number | null;
  liquidity?: number | null;
  bonded?: boolean | null;
  bondingPercentage?: number | null;
  poolAddress?: string | null;
  deployer?: string | null;
  createdAt?: string | number | Date | null;
  holdersCount?: number | null;
  top10HoldingsPercentage?: number | null;
  devHoldingsPercentage?: number | null;
  snipersHoldingsPercentage?: number | null;
  source?: string | null;
  exchange?: PulseExchange | null;
}

export interface PulseSocials {
  twitter?: string | null;
  website?: string | null;
  telegram?: string | null;
}

export interface PulseSecurity {
  buyTax?: number | null;
  sellTax?: number | null;
  isBlacklisted?: boolean | null;
  isHoneypot?: boolean | null;
  noMintAuthority?: boolean | null;
  transferPausable?: boolean | null;
}

export interface PulseTokenData {
  token: PulseToken;
  latest_price?: number | null;
  market_cap?: number | null;
  volume_1min?: number | null;
  volume_5min?: number | null;
  trades_5min?: number | null;
  buyers_5min?: number | null;
  organic_trades_5min?: number | null;
  socials?: PulseSocials | null;
  security?: PulseSecurity | null;
  dexscreenerListed?: boolean | null;
}

export type PulseEventType = 'init' | 'sync' | 'new-token' | 'update-token' | 'remove-token';

export interface PulseTokenEvent {
  type: PulseEventType;
  view?: string;
  data?: PulseTokenData | PulseTokenData[];
}
