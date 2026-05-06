import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import type { PulseTokenRow } from '../core/types.js';

const PULSE_URL = 'wss://api.mobula.io';
const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const VIEW_NAME = 'fresh-tokens';

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
  };
}

type PulseClientEvents = {
  /** Fired for init / sync rows. Use to seed dedup state, not to alert. */
  snapshot: (token: PulseTokenRow) => void;
  /** Fired only for `new-token` events — i.e. tokens entering the view live. */
  new: (token: PulseTokenRow) => void;
  open: () => void;
  close: () => void;
  error: (err: Error) => void;
};

/**
 * Wraps the Mobula Pulse Stream V2 WebSocket. Re-subscribes on every
 * reconnect and emits "new" with a flat token row for any unique token
 * received via init / sync / new-token (update-token is intentionally
 * ignored — we alert once when a token enters the view).
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
        views: [
          {
            name: VIEW_NAME,
            chainId: chainIds,
            poolTypes,
            sortBy: 'created_at',
            sortOrder: 'desc',
            limit: 50,
            filters: {
              liquidity: { gte: filters.minLiquidityUsd },
              bonded: { equals: false },
            },
          },
        ],
      },
    };
    this.ws?.send(JSON.stringify(payload));
    logger.info({ chains: chainIds.length, pools: poolTypes.length }, 'subscribed');
  }

  /**
   * Mobula wire shapes seen in production:
   *   init / sync       → { type, payload: { <viewName>: { data: [row, ...] } } }
   *   new-token         → { type, payload: { viewName, token: {...} } }
   *   update-token      → { type, payload: { viewName, token: {...} } }
   *   remove-token      → { type, payload: { viewName, tokenKey } }
   */
  private extractFromSnapshot(payload: unknown): PulseTokenRow[] {
    if (!payload || typeof payload !== 'object') return [];
    const obj = payload as Record<string, unknown>;
    const view = obj[VIEW_NAME] ?? obj.data;
    if (Array.isArray(view)) return view as PulseTokenRow[];
    if (view && typeof view === 'object' && Array.isArray((view as { data?: unknown }).data)) {
      return (view as { data: PulseTokenRow[] }).data;
    }
    return [];
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

    const evt = parsed as { type?: string; event?: string; payload?: unknown };

    if (evt.event === 'pong') return;

    switch (evt.type) {
      case 'init':
      case 'sync': {
        const list = this.extractFromSnapshot(evt.payload);
        logger.debug({ type: evt.type, count: list.length }, 'received view snapshot');
        for (const row of list) this.emit('snapshot', row);
        break;
      }
      case 'new-token': {
        const p = evt.payload as { token?: PulseTokenRow } | undefined;
        if (p?.token && typeof p.token === 'object') {
          logger.debug(
            { symbol: p.token.symbol, chain: p.token.chainId },
            'received new-token',
          );
          this.emit('new', p.token);
        }
        break;
      }
      case 'update-token':
      case 'remove-token':
        break;
      default:
        logger.debug({ type: evt.type }, 'ignored pulse message');
    }
  }
}
