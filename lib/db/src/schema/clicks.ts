import { bigint, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const clickPlayers = pgTable("click_players", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  nickname: text("nickname").notNull(),
  clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("click_players_score_idx").on(table.clicks.desc(), table.id.asc())]);

export const clickBatches = pgTable("click_batches", {
  playerId: bigint("player_id", { mode: "number" }).notNull().references(() => clickPlayers.id),
  requestId: uuid("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.playerId, table.requestId] })]);
