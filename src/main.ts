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
      maxBuyTax: config.maxBuyTax,
      maxSellTax: config.maxSellTax,
    },
  });

  pulse.on('new', (payload) => {
    const t = payload?.token;
    if (!t?.address || !t?.chainId) return;
    if (seen.alreadySeen(t.chainId, t.address)) return;
    seen.markSeen(t.chainId, t.address);

    const verdict = evaluate(payload);
    if (!verdict.ok) {
      logger.debug({ reason: verdict.reason, symbol: t.symbol }, 'token rejected');
      return;
    }
    logger.info(
      { symbol: t.symbol, chain: t.chainId, score: verdict.score },
      'qualifying token, alerting',
    );
    void pushTokenAlert(payload, verdict.score);
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
