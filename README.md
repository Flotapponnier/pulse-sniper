# pulse-sniper

A Telegram bot that detects fresh token launches across Solana, Base, Ethereum
(and any chain Mobula supports) **in real-time**, powered by the
[Mobula Pulse Stream V2](https://docs.mobula.io/indexing-stream/stream/websocket/pulse-stream-v2)
WebSocket.

The bot subscribes to a single fresh-tokens view, applies safety filters
**server-side** (so the wire is already clean) plus a defensive **client-side**
double-check, scores each token 0–100, and pushes a rich Telegram alert with
inline buttons for charting and buying.

## Features

- 🔌 Mobula Pulse Stream V2 WebSocket with automatic reconnection (exponential
  backoff) and re-subscription
- 🛡 Server-side filters: age ≤ 60s, liquidity ≥ $2k, dev / snipers / top10
  holdings caps, buy/sell tax caps, blacklisted/honeypot rejection
- 📈 Quality score combining holders, socials, mint authority, organic trades,
  DexScreener listing
- 🧠 SQLite dedup so the periodic `sync` snapshot never re-fires alerts
- 💬 Telegraf bot with `/start`, `/pause`, `/resume`, `/status` commands
- 🎨 MarkdownV2 alerts with chain-aware Chart / Buy buttons
  (DexScreener + BonkBot for Solana, Uniswap for EVM)

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Get a Mobula API key

Create one at <https://mobula.io>. Paste it into `MOBULA_API_KEY`.

### 3. Create a Telegram bot

1. Open a chat with [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow the prompts, copy the HTTP API token →
   `TELEGRAM_BOT_TOKEN`
3. Get your numeric chat id (DM [@userinfobot](https://t.me/userinfobot) or add
   the bot to a group and read `chat.id` from `getUpdates`) →
   `TELEGRAM_CHAT_ID`

### 4. Run

```bash
npm run dev          # tsx watch
# or
npm run build && npm start
```

You should see the bot log `pulse stream connected` and `subscribed`. Send
`/start` to your bot in Telegram to confirm it's responding.

## Commands

| Command   | Effect                              |
|-----------|-------------------------------------|
| `/start`  | Show config summary                 |
| `/pause`  | Mute alerts (stream keeps running)  |
| `/resume` | Resume alerts                       |
| `/status` | Report current mute state           |

## Alert preview

> _screenshot placeholder — drop a PNG here once you have one_

Each alert contains:

- Score emoji + token name/symbol/chain/source/age/holders
- Liquidity, market cap, 5-minute volume & trades
- Security badges (mint revoked, unpausable, taxes, DexScreener listed)
- Holdings breakdown (dev / snipers / top10)
- Token contract address (monospace, tap to copy)
- Inline buttons: 📊 Chart · 🚀 Buy · 𝕏 Twitter · ✉️ TG · 🌐 Site

## Configuration

All thresholds live in `.env` — see `.env.example` for the full list. The same
values are sent to Mobula as **server-side filters** and re-checked locally.

## Project layout

```
src/
├── main.ts                orchestrator
├── config.ts              env loader
├── mobula/pulse-client.ts WebSocket client (reconnect + re-subscribe)
├── core/
│   ├── types.ts           PulseTokenData / PulseTokenEvent
│   ├── seen-store.ts      SQLite dedup
│   ├── quality-gate.ts    filter + 0-100 score
│   └── formatter.ts       MarkdownV2 alert + inline keyboard
├── telegram/bot.ts        Telegraf instance + commands + push
└── utils/logger.ts        pino logger
```

## Out of scope

- Auto-trading (kept for a v2 project)
- Multi-user / multi-chat
- Web UI
- Persistent token history beyond dedup

## License

MIT
