import { Telegraf } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { config } from '../config.js';
import { formatAlert } from '../core/formatter.js';
import type { PulseTokenData } from '../core/types.js';
import { logger } from '../utils/logger.js';

export const bot = new Telegraf(config.telegramBotToken);

let muted = false;

bot.command('start', async (ctx) => {
  const summary = [
    '🎯 *Pulse Sniper online*',
    '',
    `Chains: \`${config.watchChains.join(', ')}\``,
    `DEXs: \`${config.watchPoolTypes.join(', ')}\``,
    `Max age: ${config.maxAgeSeconds}s · Min liq: $${config.minLiquidityUsd}`,
    `Dev ≤ ${config.maxDevHoldings}% · Snipers ≤ ${config.maxSnipersHoldings}% · Top10 ≤ ${config.maxTop10Holdings}%`,
    `Tax buy ≤ ${config.maxBuyTax}% / sell ≤ ${config.maxSellTax}%`,
    '',
    'Commands: /pause /resume /status',
  ].join('\n');
  await ctx.reply(summary, { parse_mode: 'Markdown' });
});

bot.command('pause', async (ctx) => {
  muted = true;
  await ctx.reply('🔕 Alerts paused.');
});

bot.command('resume', async (ctx) => {
  muted = false;
  await ctx.reply('🔔 Alerts resumed.');
});

bot.command('status', async (ctx) => {
  await ctx.reply(muted ? '🔕 Muted' : '🔔 Active — listening to Pulse Stream V2');
});

/** Forward a qualifying token to the configured chat. */
export async function pushTokenAlert(token: PulseTokenData, score: number): Promise<void> {
  if (muted) return;
  const { text, buttons } = formatAlert(token, score);
  try {
    await bot.telegram.sendMessage(config.telegramChatId, text, {
      parse_mode: 'MarkdownV2',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: buttons as InlineKeyboardButton[][] },
    });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, address: token.token.address },
      'failed to send telegram alert',
    );
  }
}

export function isMuted(): boolean {
  return muted;
}
