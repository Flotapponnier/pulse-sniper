import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import type { PulseTokenData, PulseTokenEvent } from '../core/types.js';

const PULSE_URL = 'wss://api.mobula.io';
const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

export interface PulseClientOptions {
  apiKey: string;
  chainIds: string[];
  poolTypes: string[];
  filters: {
    maxAgeSeconds: number;
    minLiquidityUsd: number;
    maxDevHoldings: number;
    maxSnipersHoldings: number;
    maxTop10Holdings: number;
    maxBuyTax: number;
    maxSellTax: number;
  };
}

type PulseClientEvents = {
  new: (token: PulseTokenData) => void;
  open: () => void;
  close: () => void;
  error: (err: Error) => void;
};

/**
 * EventEmitter wrapper around the Mobula Pulse Stream V2 WebSocket.
 * Re-subscribes on every reconnect and emits "new" with the token payload
 * for any unique fresh-token row received via init / sync / new-token.
 */
export class PulseClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  constructor(private readonly opts: PulseClientOptions) {
    super();
  }

  override on<K extends keyof PulseClientEvents>(event: K, listener: PulseClientEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof PulseClientEvents>(
    event: K,
    ...args: Parameters<PulseClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private connect(): void {
    logger.info({ url: PULSE_URL }, 'connecting to Pulse Stream V2');
    const ws = new WebSocket(PULSE_URL);
    this.ws = ws;

    ws.on('open', () => {
      logger.info('pulse stream connected');
      this.reconnectAttempts = 0;
      this.subscribe();
      this.startPing();
      this.emit('open');
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      this.handleMessage(raw);
    });

    ws.on('error', (err) => {
      logger.error({ err: err.message }, 'pulse stream socket error');
      this.emit('error', err);
    });

    ws.on('close', (code, reason) => {
      logger.warn({ code, reason: reason.toString() }, 'pulse stream closed');
      this.cleanup();
      this.emit('close');
      this.scheduleReconnect();
    });
  }

  private cleanup(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    logger.info({ delayMs: delay }, 'reconnecting');
    setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ event: 'ping' }));
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'ping send failed');
        }
      }
    }, PING_INTERVAL_MS);
  }

  private subscribe(): void {
    const { apiKey, chainIds, poolTypes, filters } = this.opts;
    const payload = {
      type: 'pulse-v2',
      authorization: apiKey,
      payload: {
        assetMode: true,
        compressed: false,
        chainId: chainIds,
        poolTypes,
        views: [
          {
            name: 'fresh-tokens',
            sortBy: 'created_at',
            sortOrder: 'desc',
            limit: 50,
            filters: {
              created_at_offset: { lte: filters.maxAgeSeconds },
              liquidity: { gte: filters.minLiquidityUsd },
              bonded: { equals: false },
              dev_holdings_percentage: { lte: filters.maxDevHoldings },
              snipers_holdings_percentage: { lte: filters.maxSnipersHoldings },
              top_10_holdings_percentage: { lte: filters.maxTop10Holdings },
              security: {
                isBlacklisted: { equals: false },
                buyTax: { lte: filters.maxBuyTax },
                sellTax: { lte: filters.maxSellTax },
              },
            },
          },
        ],
      },
    };
    this.ws?.send(JSON.stringify(payload));
    logger.info({ chains: chainIds.length, pools: poolTypes.length }, 'subscribed');
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'failed to parse pulse message');
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    const evt = parsed as Partial<PulseTokenEvent> & { event?: string };

    if (evt.event === 'pong') return;

    switch (evt.type) {
      case 'init':
      case 'sync': {
        const list = Array.isArray(evt.data) ? evt.data : evt.data ? [evt.data] : [];
        logger.debug({ type: evt.type, count: list.length }, 'received view snapshot');
        for (const item of list) this.emit('new', item);
        break;
      }
      case 'new-token': {
        const item = Array.isArray(evt.data) ? evt.data[0] : evt.data;
        if (item) this.emit('new', item);
        break;
      }
      case 'update-token':
      case 'remove-token':
        // not relevant for first-alert sniper
        break;
      default:
        logger.debug({ type: evt.type }, 'ignored pulse message');
    }
  }
}
