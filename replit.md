# Gold Click

A Telegram Mini App with a gold click button and a persistent Telegram-nickname leaderboard.

## Run

- API: `pnpm --filter @workspace/api-server run dev`
- Web: `pnpm --filter @workspace/gold-click run dev`
- Python dependencies: `uv sync --frozen`
- API uses aiohttp and pyTelegramBotAPI's AsyncTeleBot, not Flask or the unused Express scaffold.
- Both aiohttp and Telegram long polling run in the same asyncio event loop.

## Configuration

- `TELEGRAM_BOT_TOKEN`: secret from BotFather.
- `DATABASE_URL`: managed PostgreSQL connection.
- `WEB_URL`: absolute HTTPS address for the web interface. Set this explicitly to the published address for production.
- `LOG_LEVEL`: optional, defaults to INFO.
- `PORT`: supplied by the service workflow.
- During development only, the bot uses the development domain when WEB_URL is unset.
- Production intentionally disables polling when WEB_URL is unset rather than handing out a development link.

## Source map

- `artifacts/api-server/python/`: aiohttp API, Telegram launch-data verification, database operations, and Telebot polling.
- `artifacts/gold-click/`: React web interface.
- `lib/api-spec/openapi.yaml`: API contract; regenerate with `pnpm --filter @workspace/api-spec run codegen`.
- `lib/db/src/schema/clicks.ts`: PostgreSQL schema mirrored for the managed publish schema flow.
- API paths: `/api/healthz`, `/api/game`, `/api/session`, `/api/clicks`.

## Product rules and operating constraints

- Only verified Telegram launch data can submit ranked clicks; browser practice is local and unranked.
- Show Telegram @username; if the user has no username, show their Telegram first name.
- `/start`, `/play`, and `/help` send an inline launch button using WebAppInfo.
- One polling process per bot token. Stop development polling before running a published instance with that same token, or use separate development/production bot tokens.
- Polling needs a continuously running server; do not use a static-only hosting configuration.
- Launch data expires after 24 hours; reopening the Mini App creates fresh launch data.
- Never log bot tokens, Telegram initData, or raw third-party exception strings that may contain credentials.
- No fake players are seeded into the real leaderboard.

## Validation

- `pnpm run typecheck` for TypeScript.
- `uv run python -m compileall -q artifacts/api-server/python` for Python syntax.
- The first build checked the browser practice screen and API health; a signed-in Telegram UI session was not verified.
