"""Atomic, idempotent score storage backed by PostgreSQL."""
import asyncpg


def player_json(row):
    return {
        "id": str(row["id"]),
        "nickname": row["nickname"],
        "clicks": int(row["clicks"]),
        "rank": int(row["rank"]),
    }


async def player(conn, user_id):
    row = await conn.fetchrow(
        """SELECT p.*, 1 + (SELECT count(*) FROM click_players q
           WHERE q.clicks > p.clicks OR (q.clicks = p.clicks AND q.id < p.id)) AS rank
           FROM click_players p WHERE p.id=$1""",
        user_id,
    )
    return player_json(row)


async def register(pool: asyncpg.Pool, user: dict):
    # Telegram usernames are optional. Use their Telegram display name if absent.
    nickname = "@" + user["username"] if user.get("username") else user.get("first_name", "Telegram player")
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO click_players (id,nickname) VALUES ($1,$2)
               ON CONFLICT (id) DO UPDATE SET nickname=EXCLUDED.nickname""",
            user["id"], nickname[:128],
        )
        return await player(conn, user["id"])


async def add_clicks(conn, user_id, count, request_id):
    row = await conn.fetchrow("SELECT clicks FROM click_players WHERE id=$1 FOR UPDATE", user_id)
    if row is None:
        raise ValueError("Open a session before clicking.")
    inserted = await conn.fetchval(
        """INSERT INTO click_batches (player_id,request_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING RETURNING request_id""", user_id, request_id,
    )
    if inserted:
        await conn.execute(
            "UPDATE click_players SET clicks=clicks+$2,updated_at=now() WHERE id=$1",
            user_id, count,
        )
    return await player(conn, user_id)


async def overview(pool):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id,nickname,clicks,row_number() OVER (ORDER BY clicks DESC,id ASC) AS rank
               FROM click_players WHERE clicks>0 ORDER BY clicks DESC,id ASC LIMIT 50"""
        )
        totals = await conn.fetchrow(
            "SELECT coalesce(sum(clicks),0) AS clicks,count(*) FILTER (WHERE clicks>0) AS players FROM click_players"
        )
    return {
        "leaderboard": [player_json(row) for row in rows],
        "totalClicks": int(totals["clicks"]),
        "totalPlayers": int(totals["players"]),
    }
