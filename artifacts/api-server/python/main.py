"""aiohttp HTTP API and Telebot polling share one asyncio event loop."""
import asyncio
import contextlib
import logging
import os
import time
from uuid import UUID
from urllib.parse import urlparse

import asyncpg
from aiohttp import web

from auth import verify_telegram
from bot import run_bot
from storage import add_clicks, overview, register

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("goldclick.api")
# Do not allow Telebot's default error logger to expose token-bearing URLs.
logging.getLogger("TeleBot").disabled = True


@web.middleware
async def errors(request, handler):
    start = time.monotonic()
    try:
        response = await handler(request)
    except web.HTTPException as exc:
        response = web.json_response({"error": exc.reason}, status=exc.status)
    except (ValueError, TypeError, KeyError):
        response = web.json_response({"error": "Invalid request data."}, status=400)
    except Exception as exc:
        logger.error("Request failed (%s)", type(exc).__name__)
        response = web.json_response({"error": "Unable to save right now. Please retry."}, status=500)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    logger.info("%s %s %s %.0fms", request.method, request.path, response.status,
                (time.monotonic() - start) * 1000)
    return response


async def identity(request, data):
    return verify_telegram(data.get("initData", ""), request.app["token"])


async def session(request):
    data = await request.json()
    if not isinstance(data, dict):
        raise web.HTTPBadRequest(reason="Expected a JSON object.")
    user = await identity(request, data)
    return web.json_response(await register(request.app["pool"], user))


async def clicks(request):
    data = await request.json()
    if not isinstance(data, dict):
        raise web.HTTPBadRequest(reason="Expected a JSON object.")
    user = await identity(request, data)
    count = data.get("count")
    if type(count) is not int or not 1 <= count <= 50:
        raise web.HTTPBadRequest(reason="Click count must be between 1 and 50.")
    request_id = UUID(data["requestId"])
    # PostgreSQL advisory lock makes per-player limits work across processes.
    async with request.app["pool"].acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", user["id"])
            existing = await conn.fetchval(
                "SELECT 1 FROM click_batches WHERE player_id=$1 AND request_id=$2", user["id"], request_id
            )
            if not existing:
                recent = await conn.fetchval(
                    """SELECT count(*) FROM click_batches
                       WHERE player_id=$1 AND created_at > now() - interval '1 second'""", user["id"]
                )
                if recent >= 8:
                    raise web.HTTPTooManyRequests(reason="Too many click batches. Please slow down.")
            result = await add_clicks(conn, user["id"], count, request_id)
    return web.json_response(result)


async def game(request):
    result = await overview(request.app["pool"])
    result.update(botUsername=request.app["bot_username"], pollingReady=request.app["polling_ready"])
    return web.json_response(result)


async def health(request):
    await request.app["pool"].fetchval("SELECT 1")
    return web.json_response({"status": "ok"})


async def lifecycle(app):
    app["pool"] = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=10)
    task = asyncio.create_task(run_bot(app), name="telegram-polling")
    logger.info("aiohttp ready; Telegram polling task started")
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await app["pool"].close()


def create_app():
    app = web.Application(middlewares=[errors], client_max_size=32768)
    app["token"] = os.getenv("TELEGRAM_BOT_TOKEN", "")
    web_url = os.getenv("WEB_URL", "").strip()
    if not web_url and os.getenv("NODE_ENV") != "production" and os.getenv("REPLIT_DEV_DOMAIN"):
        web_url = "https://" + os.environ["REPLIT_DEV_DOMAIN"] + "/"
    if web_url and (urlparse(web_url).scheme != "https" or not urlparse(web_url).netloc):
        raise ValueError("WEB_URL must be an absolute HTTPS URL.")
    app["web_url"] = web_url
    app["bot_username"] = None
    app["polling_ready"] = False
    app.cleanup_ctx.append(lifecycle)
    app.add_routes([
        web.get("/api/healthz", health),
        web.get("/api/game", game),
        web.post("/api/session", session),
        web.post("/api/clicks", clicks),
    ])
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host="0.0.0.0", port=int(os.getenv("PORT", "8080")), access_log=None)
