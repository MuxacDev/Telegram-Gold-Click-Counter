# Gold Click

Telegram click-counter bot with an aiohttp API and React web interface.

## Features

- Gold circle adds one click per press.
- PostgreSQL-backed leaderboard ordered by score, showing Telegram nicknames.
- Telebot (`pyTelegramBotAPI`) async bot with long polling.
- Inline launch button uses `telebot.types.WebAppInfo(url=web_url)`.
- Server-side verification of Telegram Mini App launch data.
- Batched, idempotent click saving and request rate limiting.
- Separate local browser practice mode, excluded from ranked scores.
- Application logging without credentials or launch data.

## Start

1. Create a bot with Telegram's **@BotFather** and store its token as `TELEGRAM_BOT_TOKEN` in Secrets.
2. Provide PostgreSQL through `DATABASE_URL`.
3. Set `WEB_URL` to the web interface's absolute HTTPS address. Development defaults to the development domain; production requires an explicit address.
4. Install Python dependencies with `uv sync --frozen` and frontend dependencies with `pnpm install`.
5. Run the API and web workflows. Open the bot's private chat, send `/start`, and press **Play Gold Click**.

The API workflow runs `uv run python python/main.py` from `artifacts/api-server`. The web workflow runs Vite from `artifacts/gold-click`. For production, the registered frontend builds static files, while the API service runs `uv run python artifacts/api-server/python/main.py` from the project root.

## Database

The development tables are already initialized. Their schema is defined in `lib/db/src/schema/clicks.ts`; development schema updates can be applied with `pnpm --filter @workspace/db run push`. The managed publish flow applies schema differences to production. Do not add startup-time database migrations.

## Operating notes

Only one instance may poll a particular bot token. Stop the development bot before starting production with the same token, or use separate tokens. Keep the backend running continuously for polling.

Telegram usernames are optional: players without one are shown using their Telegram first name. Telegram identity is derived only from validated launch data, never from a client-supplied nickname or user ID.

Set `LOG_LEVEL` to adjust logging verbosity. Never enable third-party HTTP debugging that could expose the bot token.
