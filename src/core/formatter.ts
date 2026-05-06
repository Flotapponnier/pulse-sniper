import type { InlineKeyboardButton } from 'telegraf/types';
import type { PulseTokenRow } from './types.js';

const MDV2_SPECIALS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

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

function buyUrl(t: PulseTokenRow): string {
  const { chainId, address, source } = t;
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

function buyLabel(t: PulseTokenRow): string {
  if (t.chainId === 'solana:solana') {
    if (t.source === 'pumpfun' || t.source === 'pump.fun') return 'Trade on pump.fun';
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

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

export interface FormattedAlert {
  text: string;
  buttons: InlineKeyboardButton[][];
}

/** Build a MarkdownV2 alert + inline keyboard for a flat Pulse token row. */
export function formatAlert(t: PulseTokenRow, score: number): FormattedAlert {
  const name = escapeMd(t.name ?? 'Unknown');
  const symbol = escapeMd(t.symbol ?? '???');
  const chain = escapeMd(chainLabel(t.chainId));
  const source = escapeMd(t.exchange?.name ?? t.source ?? 'unknown');
  const age = fmtAge(t.createdAt);
  const holders = fmtNum(t.holdersCount);
  const label = scoreLabel(score);

  const liq = fmtUsd(t.liquidity);
  const mc = fmtUsd(t.marketCap ?? t.marketCapDiluted);
  const bonding = fmtPct(t.bondingPercentage);

  const dev = fmtPct(t.devHoldings);
  const snipers = fmtPct(t.snipersHoldings);
  const top10 = fmtPct(t.top10Holdings);

  const metricBlock = [
    `${pad('Liquidity', 11)} ${liq}`,
    `${pad('Market cap', 11)} ${mc}`,
    `${pad('Bonding %', 11)} ${bonding}`,
    `${pad('Holders', 11)} ${holders}`,
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
  lines.push('');
  lines.push(`\`${escapeMd(t.address)}\``);

  const row1: InlineKeyboardButton[] = [
    { text: 'Chart', url: chartUrl(t.chainId, t.address) },
    { text: buyLabel(t), url: buyUrl(t) },
  ];

  return { text: lines.join('\n'), buttons: [row1] };
}
