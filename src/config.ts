import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid numeric env var: ${name}=${v}`);
  }
  return n;
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  mobulaApiKey: required('MOBULA_API_KEY'),
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  telegramChatId: required('TELEGRAM_CHAT_ID'),

  watchChains: list('WATCH_CHAINS', ['solana:solana', 'evm:8453', 'evm:1']),
  watchPoolTypes: list('WATCH_POOL_TYPES', [
    'pumpfun',
    'moonshot-evm',
    'raydium-v4',
    'uniswap-v2',
    'uniswap-v3',
  ]),

  maxAgeSeconds: num('MAX_AGE_SECONDS', 60),
  minLiquidityUsd: num('MIN_LIQUIDITY_USD', 2000),
  maxDevHoldings: num('MAX_DEV_HOLDINGS', 15),
  maxSnipersHoldings: num('MAX_SNIPERS_HOLDINGS', 20),
  maxTop10Holdings: num('MAX_TOP10_HOLDINGS', 70),
  maxBuyTax: num('MAX_BUY_TAX', 5),
  maxSellTax: num('MAX_SELL_TAX', 10),

  dbPath: process.env.DB_PATH ?? './bot.db',
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

export type AppConfig = typeof config;
