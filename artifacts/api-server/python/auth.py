"""Validate Telegram Mini App launch data; never trust client-supplied IDs."""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from aiohttp import web


def verify_telegram(init_data: str, token: str) -> dict:
    if not token or not isinstance(init_data, str) or len(init_data) > 16384:
        raise web.HTTPUnauthorized(reason="Open this game from the Telegram bot.")
    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    if len(dict(pairs)) != len(pairs):
        raise web.HTTPUnauthorized(reason="Invalid Telegram launch data.")
    fields = dict(pairs)
    signature = fields.pop("hash", "")
    check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise web.HTTPUnauthorized(reason="Telegram identity could not be verified.")
    try:
        age = time.time() - int(fields["auth_date"])
        user = json.loads(fields["user"])
        if age < -30 or age > 86400 or not isinstance(user["id"], int) or user["id"] <= 0:
            raise ValueError("Expired or invalid identity")
    except (KeyError, ValueError, TypeError):
        raise web.HTTPUnauthorized(reason="Session expired. Reopen the game in Telegram.") from None
    return user
