"""Telebot polling and WebAppInfo launch button."""
import asyncio
import logging

from telebot.async_telebot import AsyncTeleBot
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, BotCommand

logger = logging.getLogger("goldclick.bot")


async def run_bot(app):
    token = app["token"]
    web_url = app["web_url"]
    if not token or not web_url:
        logger.warning("Polling disabled: TELEGRAM_BOT_TOKEN and HTTPS WEB_URL are required")
        return
    bot = AsyncTeleBot(token)
    app["bot"] = bot

    @bot.message_handler(commands=["start", "play", "help"])
    async def launch(message):
        if message.chat.type != "private":
            await bot.reply_to(message, "Open a private chat with me and send /start to play.")
            return
        keyboard = InlineKeyboardMarkup()
        keyboard.add(InlineKeyboardButton("Play Gold Click", web_app=WebAppInfo(url=web_url)))
        await bot.send_message(
            message.chat.id,
            "Welcome to Gold Click!\n\nTap the gold circle, collect clicks, and climb the leaderboard. "
            "Your score is saved under your Telegram nickname.",
            reply_markup=keyboard,
        )
        logger.info("Sent game launch button")

    try:
        while True:
            try:
                me = await bot.get_me()
                app["bot_username"] = me.username
                await bot.delete_webhook(drop_pending_updates=False)
                await bot.set_my_commands([
                    BotCommand("start", "Open Gold Click"),
                    BotCommand("play", "Play and climb the leaderboard"),
                    BotCommand("help", "How to play"),
                ])
                app["polling_ready"] = True
                logger.info("Telegram bot initialized; starting long polling")
                await bot.infinity_polling(timeout=30, request_timeout=40, skip_pending=False)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                app["polling_ready"] = False
                # Exception text from third-party clients can contain token URLs.
                logger.error("Telegram initialization failed (%s); retrying in 15 seconds", type(exc).__name__)
                await asyncio.sleep(15)
    finally:
        app["polling_ready"] = False
        await bot.close_session()
