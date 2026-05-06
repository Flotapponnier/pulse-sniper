import type { InlineKeyboardButton } from 'telegraf/types';
import type { PulseTokenData } from './types.js';

const MDV2_SPECIALS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape MarkdownV2 reserved characters per Telegram Bot API spec. */
export function escapeMd(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(MDV2_SPECIALS, '\\$1');
}

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function fmtAge(createdAt: string | number | Date | null | undefined): string {
  if (createdAt === null || createdAt === undefined) return '—';
  const ms = new Date(createdAt).getTime();
  if (!Number.isFinite(ms)) return '—';
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${sec % 60}s`;
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'ELITE';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'FAIR';
  return 'LOW';
}

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

function buyUrl(payload: PulseTokenData): string {
  const { chainId, address, source } = payload.token;
  if (chainId === 'solana:solana') {
    if (source === 'pumpfun' || source === 'pump.fun') {
      return `https://pump.fun/coin/${address}`;
    }
    return `https://jup.ag/swap/SOL-${address}`;
  }
  const chainParam =
    chainId === 'evm:8453'
      ? '&chain=base'
      : chainId === 'evm:42161'
        ? '&chain=arbitrum'
        : chainId === 'evm:10'
          ? '&chain=optimism'
          : chainId === 'evm:137'
            ? '&chain=polygon'
            : '';
  return `https://app.uniswap.org/swap?outputCurrency=${address}${chainParam}`;
}

function buyLabel(payload: PulseTokenData): string {
  const { chainId, source } = payload.token;
  if (chainId === 'solana:solana') {
    if (source === 'pumpfun' || source === 'pump.fun') return 'Trade on pump.fun';
    return 'Swap on Jupiter';
  }
  return 'Swap on Uniswap';
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

/**
 * Pad a string to a fixed visible length inside a fenced code block.
 * Inside ``` blocks Telegram renders monospace, so we get column alignment.
 */
function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

export interface FormattedAlert {
  text: string;
  buttons: InlineKeyboardButton[][];
}

/**
 * Build a MarkdownV2 alert message + inline keyboard for a qualifying token.
 * Designed to look clean without emojis: bold header, monospace metric block
 * with aligned columns, plain-text security row, contract on its own line.
 */
export function formatAlert(payload: PulseTokenData, score: number): FormattedAlert {
  const t = payload.token;
  const sec = payload.security ?? {};
  const socials = payload.socials ?? {};

  const name = escapeMd(t.name ?? 'Unknown');
  const symbol = escapeMd(t.symbol ?? '???');
  const chain = escapeMd(chainLabel(t.chainId));
  const source = escapeMd(t.exchange?.name ?? t.source ?? 'unknown');
  const age = fmtAge(t.createdAt);
  const holders = fmtNum(t.holdersCount);
  const label = scoreLabel(score);

  const liq = fmtUsd(t.liquidity);
  const mc = fmtUsd(payload.market_cap ?? t.marketCap);
  const vol5 = fmtUsd(payload.volume_5min);
  const trades5 = fmtNum(payload.trades_5min);

  const dev = fmtPct(t.devHoldingsPercentage);
  const snipers = fmtPct(t.snipersHoldingsPercentage);
  const top10 = fmtPct(t.top10HoldingsPercentage);

  const securityFlags: string[] = [];
  if (sec.noMintAuthority) securityFlags.push('mint revoked');
  if (sec.transferPausable === false) securityFlags.push('unpausable');
  if ((sec.buyTax ?? 0) === 0 && (sec.sellTax ?? 0) === 0) {
    securityFlags.push('0/0 tax');
  } else {
    securityFlags.push(`${sec.buyTax ?? 0}/${sec.sellTax ?? 0} tax`);
  }
  if (payload.dexscreenerListed) securityFlags.push('DS listed');

  // Monospace metric block — perfect column alignment inside ``` fence.
  // Note: inside a code block we do NOT escape MarkdownV2 specials.
  const metricBlock = [
    `${pad('Liquidity', 10)} ${liq}`,
    `${pad('Market cap', 10)} ${mc}`,
    `${pad('Volume 5m', 10)} ${vol5}  (${trades5} trades)`,
    `${pad('Holders', 10)} ${holders}`,
  ].join('\n');

  const lines: string[] = [];
  lines.push(`*${symbol}*  —  _${name}_`);
  lines.push(
    `${chain}  ·  ${source}  ·  ${escapeMd(age)} old  ·  *${score}/100*  ·  *${escapeMd(label)}*`,
  );
  lines.push('');
  lines.push('```');
  lines.push(metricBlock);
  lines.push('```');
  lines.push(
    `*Holdings* — dev ${escapeMd(dev)}  ·  snipers ${escapeMd(snipers)}  ·  top10 ${escapeMd(top10)}`,
  );
  lines.push(`*Security* — ${escapeMd(securityFlags.join(' · '))}`);
  lines.push('');
  lines.push(`\`${escapeMd(t.address)}\``);

  const row1: InlineKeyboardButton[] = [
    { text: 'Chart', url: chartUrl(t.chainId, t.address) },
    { text: buyLabel(payload), url: buyUrl(payload) },
  ];
  const row2: InlineKeyboardButton[] = [];
  if (socials.twitter) row2.push({ text: 'Twitter', url: socials.twitter });
  if (socials.telegram) row2.push({ text: 'Telegram', url: socials.telegram });
  if (socials.website) row2.push({ text: 'Website', url: socials.website });

  const buttons: InlineKeyboardButton[][] = row2.length > 0 ? [row1, row2] : [row1];

  return { text: lines.join('\n'), buttons };
}
