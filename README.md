# pulse-sniper

A Telegram bot that detects fresh token launches across Solana, Base, Ethereum
(and any chain Mobula supports) in real-time, powered by the
[Mobula Pulse Stream V2](https://docs.mobula.io/indexing-stream/stream/websocket/pulse-stream-v2)
WebSocket.

The bot subscribes to a single `fresh-tokens` view, scores each token 0-100,
and pushes a clean Telegram alert with direct Chart / Buy buttons.

## How it works

```
DEXs (pump.fun · Raydium · Uniswap · Moonshot · ...)
        │
        ▼  indexed in real-time
Mobula Pulse Stream V2  (wss://api.mobula.io)
        │
        ▼  push as soon as a fresh token enters the view
pulse-sniper
  ├── PulseClient   ── one WebSocket, auto-reconnect, re-subscribe
  ├── SeenStore     ── SQLite dedup keyed by `chainId|address`
  ├── QualityGate   ── client-side double-check + 0-100 score
  └── Formatter     ── MarkdownV2 message + inline keyboard
        │
        ▼
Telegram chat
```

The flow inside `main.ts`:

1. **Connect & subscribe.** Single WebSocket, single view called `fresh-tokens`,
   sorted by `created_at` desc with server-side filters (`liquidity >= ...`,
   `bonded == false`).
2. **Init / sync are silent.** When the WebSocket opens, Mobula sends an `init`
   snapshot of the 50 most recent tokens, then periodic `sync` replays. We use
   them only to seed the dedup store — they are not "new launches", just the
   current state of the view.
3. **`new-token` triggers an alert.** Every time a brand-new token enters the
   view live, Mobula pushes a `new-token` event. We dedup, score, format, send.
4. **Resilience.** Ping every 30s, reconnect with exponential backoff
   (1s → 2s → 4s … capped at 30s), and re-send the subscribe payload because
   subscriptions don't persist server-side.

## Features

- Real-time WebSocket subscription with automatic reconnect + re-subscribe
- Server-side filtering (liquidity, bonded) + client-side defensive checks
- 0-100 quality score combining holders, holdings concentration, pool growth,
  trending and trader composition
- SQLite dedup keyed by `chainId|address` so periodic sync replays never
  re-fire alerts
- Telegraf bot with `/start`, `/pause`, `/resume`, `/status`
- MarkdownV2 alerts with chain-aware Chart / Buy buttons (DexScreener for
  charts, pump.fun direct page for pumpfun tokens, Jupiter for other Solana
  tokens, Uniswap for EVM)

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Get a Mobula API key

Create one at <https://mobula.io>. Paste it into `MOBULA_API_KEY`.

### 3. Create a Telegram bot

1. Open a chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot`, follow the prompts, copy the HTTP API token into
   `TELEGRAM_BOT_TOKEN`.
3. Get your numeric chat id — DM [@userinfobot](https://t.me/userinfobot) or
   add the bot to a group and read `chat.id` from `getUpdates`. Put it in
   `TELEGRAM_CHAT_ID`.
4. **Important**: open a DM with your bot and send `/start` once. Telegram
   refuses `sendMessage` to a user who has never written to the bot first.

### 4. Run

```bash
npm run dev          # tsx watch
# or
npm run build && npm start
```

You should see logs `pulse stream connected` then `subscribed`. After that,
each `new-token` line in the log corresponds to one Telegram alert.

## Commands

| Command   | Effect                              |
|-----------|-------------------------------------|
| `/start`  | Show config summary                 |
| `/pause`  | Mute alerts (stream keeps running)  |
| `/resume` | Resume alerts                       |
| `/status` | Report current mute state           |

## Alert layout

```
PULSE  —  Pulse Sniper Demo
Solana · pump.fun · 25s old · 92/100 · ELITE

Liquidity   $18.5k
Market cap  $12.3k
Bonding %   21.4%
Holders     142

Holdings — dev 3.1%  ·  snipers 4.8%  ·  top10 41.2%

7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3
```

Inline buttons:
- **Chart** — DexScreener page for the chain
- **Trade on pump.fun / Swap on Jupiter / Swap on Uniswap** — direct link to
  the relevant DEX UI for that chain (no third-party trading bot)

## Configuration

All thresholds live in `.env` (see `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `WATCH_CHAINS` | `solana:solana,evm:8453,evm:1` | Mobula chain ids, comma-separated |
| `WATCH_POOL_TYPES` | `pumpfun,moonshot-evm,raydium-v4,uniswap-v2,uniswap-v3` | DEX factories |
| `MAX_AGE_SECONDS` | `60` | Reject tokens older than this in the client gate |
| `MIN_LIQUIDITY_USD` | `2000` | Server-side `liquidity >= ...` filter |
| `MAX_DEV_HOLDINGS` | `15` | Reject if dev wallet > X% of supply |
| `MAX_SNIPERS_HOLDINGS` | `20` | Reject if sniper bots > X% of supply |
| `MAX_TOP10_HOLDINGS` | `70` | Reject if top 10 wallets > X% combined |
| `DB_PATH` | `./bot.db` | SQLite dedup file |
| `LOG_LEVEL` | `info` | `debug` shows rejected tokens too |

`MAX_BUY_TAX` / `MAX_SELL_TAX` are kept in `.env.example` for reference but
are no longer enforced — Mobula's Pulse Stream V2 does not currently expose
per-token security/tax data on the wire for fresh launches.

## Project layout

```
src/
├── main.ts                  orchestrator (snapshot → seed dedup, new → alert)
├── config.ts                env loader
├── mobula/pulse-client.ts   Mobula WebSocket client
├── core/
│   ├── types.ts             flat PulseTokenRow shape
│   ├── seen-store.ts        SQLite dedup
│   ├── quality-gate.ts      client filter + 0-100 score
│   └── formatter.ts         MarkdownV2 alert + inline keyboard
├── telegram/bot.ts          Telegraf instance + commands + push
└── utils/logger.ts          pino logger
docs/
└── pulse-sniper.excalidraw  architecture board + video script
```

## Wire format reference

What Mobula actually sends on `wss://api.mobula.io`:

```jsonc
// init / sync — full snapshot of the view, replace state, do not merge
{
  "type": "init",
  "payload": {
    "fresh-tokens": {
      "data": [ /* flat token rows */ ]
    }
  }
}

// new-token — single token entering the view live
{
  "type": "new-token",
  "payload": {
    "viewName": "fresh-tokens",
    "token": { /* flat token row */ }
  }
}

// keep-alive
{ "event": "ping" }   // client → server every 30s
```

A flat token row contains, among other fields:
`address`, `chainId`, `symbol`, `name`, `price`, `marketCap`, `liquidity`,
`bonded`, `bondingPercentage`, `poolAddress`, `deployer`, `createdAt`,
`holdersCount`, `devHoldings`, `snipersHoldings`, `top10Holdings`,
`source`, `exchange`.

## Out of scope

- Auto-trading (left for a v2 project)
- Multi-user / multi-chat
- Web UI
- Persistent token history beyond the dedup table

## License

MIT
