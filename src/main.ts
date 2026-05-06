import { config } from './config.js';
import { PulseClient } from './mobula/pulse-client.js';
import { SeenStore } from './core/seen-store.js';
import { evaluate } from './core/quality-gate.js';
import { bot, pushTokenAlert } from './telegram/bot.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const seen = new SeenStore(config.dbPath);

  const pulse = new PulseClient({
    apiKey: config.mobulaApiKey,
    chainIds: config.watchChains,
    poolTypes: config.watchPoolTypes,
    filters: {
      maxAgeSeconds: config.maxAgeSeconds,
      minLiquidityUsd: config.minLiquidityUsd,
      maxDevHoldings: config.maxDevHoldings,
      maxSnipersHoldings: config.maxSnipersHoldings,
      maxTop10Holdings: config.maxTop10Holdings,
    },
  });

  // Snapshots (init / sync) prime dedup state so we don't alert on already-known
  // tokens, but never trigger a Telegram message themselves.
  pulse.on('snapshot', (token) => {
    if (!token?.address || !token?.chainId) return;
    seen.markSeen(token.chainId, token.address);
  });

  pulse.on('new', (token) => {
    if (!token?.address || !token?.chainId) return;
    if (seen.alreadySeen(token.chainId, token.address)) return;
    seen.markSeen(token.chainId, token.address);

    const verdict = evaluate(token);
    if (!verdict.ok) {
      logger.debug({ reason: verdict.reason, symbol: token.symbol }, 'token rejected');
      return;
    }
    logger.info(
      { symbol: token.symbol, chain: token.chainId, score: verdict.score },
      'qualifying token, alerting',
    );
    void pushTokenAlert(token, verdict.score);
  });

  pulse.on('error', (err) => {
    logger.warn({ err: err.message }, 'pulse error');
  });

  pulse.start();
  await bot.launch();
  logger.info('telegram bot launched');

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    pulse.stop();
    bot.stop(signal);
    seen.close();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err);
  process.exit(1);
});
