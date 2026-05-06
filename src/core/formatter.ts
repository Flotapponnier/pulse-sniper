import type { InlineKeyboardButton } from 'telegraf/types';
import type { PulseTokenData } from './types.js';

const MDV2_SPECIALS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape MarkdownV2 reserved characters per Telegram Bot API spec. */
export function escapeMd(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(MDV2_SPECIALS, '\\$1');
}

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '?';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '?';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '?';
  return `${value.toFixed(1)}%`;
}

function fmtAge(createdAt: string | number | Date | null | undefined): string {
  if (createdAt === null || createdAt === undefined) return '?';
  const ms = new Date(createdAt).getTime();
  if (!Number.isFinite(ms)) return '?';
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${sec % 60}s`;
}

function scoreEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

/** Map Mobula chainId → DexScreener path segment. */
function dexscreenerChain(chainId: string): string {
  if (chainId === 'solana:solana') return 'solana';
  if (chainId === 'evm:1') return 'ethereum';
  if (chainId === 'evm:8453') return 'base';
  if (chainId === 'evm:56') return 'bsc';
  if (chainId === 'evm:42161') return 'arbitrum';
  if (chainId === 'evm:10') return 'optimism';
  if (chainId === 'evm:137') return 'polygon';
  return chainId.split(':').pop() ?? 'ethereum';
}

function chartUrl(chainId: string, address: string): string {
  return `https://dexscreener.com/${dexscreenerChain(chainId)}/${address}`;
}

function buyUrl(chainId: string, address: string): string {
  if (chainId === 'solana:solana') {
    return `https://t.me/bonkbot_bot?start=ref_pulse_ca_${address}`;
  }
  return `https://app.uniswap.org/swap?outputCurrency=${address}`;
}

function chainLabel(chainId: string): string {
  if (chainId === 'solana:solana') return 'Solana';
  if (chainId === 'evm:1') return 'Ethereum';
  if (chainId === 'evm:8453') return 'Base';
  if (chainId === 'evm:56') return 'BSC';
  if (chainId === 'evm:42161') return 'Arbitrum';
  if (chainId === 'evm:10') return 'Optimism';
  if (chainId === 'evm:137') return 'Polygon';
  return chainId;
}

export interface FormattedAlert {
  text: string;
  buttons: InlineKeyboardButton[][];
}

/**
 * Build a MarkdownV2 alert message + inline keyboard for a qualifying token.
 */
export function formatAlert(payload: PulseTokenData, score: number): FormattedAlert {
  const t = payload.token;
  const sec = payload.security ?? {};
  const socials = payload.socials ?? {};

  const name = escapeMd(t.name ?? 'Unknown');
  const symbol = escapeMd(t.symbol ?? '???');
  const chain = escapeMd(chainLabel(t.chainId));
  const source = escapeMd(t.exchange?.name ?? t.source ?? 'unknown');
  const age = escapeMd(fmtAge(t.createdAt));
  const holders = escapeMd(fmtNum(t.holdersCount));

  const liq = escapeMd(fmtUsd(t.liquidity));
  const mc = escapeMd(fmtUsd(payload.market_cap ?? t.marketCap));
  const vol5 = escapeMd(fmtUsd(payload.volume_5min));
  const trades5 = escapeMd(fmtNum(payload.trades_5min));

  const dev = escapeMd(fmtPct(t.devHoldingsPercentage));
  const snipers = escapeMd(fmtPct(t.snipersHoldingsPercentage));
  const top10 = escapeMd(fmtPct(t.top10HoldingsPercentage));

  const badges: string[] = [];
  if (sec.noMintAuthority) badges.push('🔒 mint revoked');
  if (sec.transferPausable === false) badges.push('▶️ unpausable');
  if ((sec.buyTax ?? 0) === 0 && (sec.sellTax ?? 0) === 0) {
    badges.push('🆓 0/0 tax');
  } else {
    badges.push(`💰 ${escapeMd(sec.buyTax ?? 0)}/${escapeMd(sec.sellTax ?? 0)} tax`);
  }
  if (payload.dexscreenerListed) badges.push('📈 DS listed');

  const lines: string[] = [];
  lines.push(`${scoreEmoji(score)} *${name}* \\(${symbol}\\) — score *${score}*`);
  lines.push(`⛓ ${chain}  •  🏛 ${source}  •  ⏱ ${age}  •  👥 ${holders}`);
  lines.push('');
  lines.push(`💧 Liq: *${liq}*  •  📊 MC: *${mc}*`);
  lines.push(`📈 Vol 5m: *${vol5}*  •  🔁 Trades 5m: *${trades5}*`);
  if (badges.length > 0) {
    lines.push(badges.map(escapeMd).join(' • '));
  }
  lines.push('');
  lines.push(`👤 Dev: *${dev}*  •  🎯 Snipers: *${snipers}*  •  🔝 Top10: *${top10}*`);
  lines.push('');
  lines.push(`\`${escapeMd(t.address)}\``);

  const row1: InlineKeyboardButton[] = [
    { text: '📊 Chart', url: chartUrl(t.chainId, t.address) },
    { text: '🚀 Buy', url: buyUrl(t.chainId, t.address) },
  ];
  const row2: InlineKeyboardButton[] = [];
  if (socials.twitter) row2.push({ text: '𝕏 Twitter', url: socials.twitter });
  if (socials.telegram) row2.push({ text: '✉️ TG', url: socials.telegram });
  if (socials.website) row2.push({ text: '🌐 Site', url: socials.website });

  const buttons: InlineKeyboardButton[][] = row2.length > 0 ? [row1, row2] : [row1];

  return { text: lines.join('\n'), buttons };
}
