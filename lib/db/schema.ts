import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Attachment, MessagePart } from "@/lib/workspace/types";

/**
 * GameSmith database schema (Postgres 18, Drizzle).
 *
 * Phase 2 tables: users, games, game_versions, messages, webhook_events.
 * Phase 5: provider_keys. Later phases add agent_runs, wallets,
 * spark_ledger, purchases and sandboxes (see docs/architecture.md).
 *
 * Change this file, then run `npm run db:generate` and commit the SQL
 * migration it writes to ./drizzle.
 */

// Enum values mirror lib/games/types.ts and lib/billing/types.ts.
export const planEnum = pgEnum("plan", ["free", "forge", "studio"]);
export const gameStatusEnum = pgEnum("game_status", ["draft", "building", "ready", "error"]);
export const gameVisibilityEnum = pgEnum("game_visibility", ["private", "link"]);
export const versionStatusEnum = pgEnum("version_status", ["ready", "error"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
// Mirrors PROVIDERS in lib/ai/models.ts.
export const providerEnum = pgEnum("provider", ["anthropic", "openai", "openrouter", "fal"]);
export const keyStatusEnum = pgEnum("key_status", ["valid", "invalid", "unverified"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** One row per Clerk user. The primary key is the Clerk user id. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  imageUrl: text("image_url"),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  /** Set when the Clerk user is deleted. Personal fields are cleared at the same time. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pitch: text("pitch").notNull().default(""),
    genre: text("genre").notNull().default(""),
    status: gameStatusEnum("status").notNull().default("draft"),
    visibility: gameVisibilityEnum("visibility").notNull().default("private"),
    /** Seed for the generated cover art until a screenshot exists. */
    coverSeed: integer("cover_seed")
      .notNull()
      .default(sql`floor(random() * 2147483647)::int`),
    /** Latest playable version number (0 = nothing built yet). */
    currentVersion: integer("current_version").notNull().default(0),
    /** Model chosen in the composer (catalog id from lib/ai/models.ts). Null = default. */
    modelId: text("model_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Soft delete, so the library can offer "restore". */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("games_owner_updated_idx").on(t.ownerId, t.updatedAt.desc()),
    check("games_title_length", sql`char_length(${t.title}) between 1 and 120`),
    check("games_current_version_nonneg", sql`${t.currentVersion} >= 0`),
  ],
);

export const gameVersions = pgTable(
  "game_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    label: text("label").notNull(),
    prompt: text("prompt").notNull().default(""),
    status: versionStatusEnum("status").notNull(),
    filesChanged: integer("files_changed").notNull().default(0),
    /** Object storage key of the workspace snapshot (Phase 7). */
    snapshotKey: text("snapshot_key"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("game_versions_game_number_uq").on(t.gameId, t.number),
    check("game_versions_number_positive", sql`${t.number} > 0`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** Agent run that produced this message (foreign key added with agent_runs, Phase 6/9). */
    runId: uuid("run_id"),
    role: messageRoleEnum("role").notNull(),
    parts: jsonb("parts").$type<MessagePart[]>().notNull(),
    attachments: jsonb("attachments").$type<Attachment[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_game_created_idx").on(t.gameId, t.createdAt)],
);

/** Processed webhook deliveries, for idempotency (Clerk now, Polar in Phase 6). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Bring-your-own provider keys. The key itself is only ever stored
 * encrypted (AES-256-GCM, lib/crypto/keyring.ts) with additional data bound
 * to user + provider, so a ciphertext copied to another row will not decrypt.
 */
export const providerKeys = pgTable(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    /** Keyring version that encrypted this row (for rotation). */
    keyVersion: integer("key_version").notNull(),
    /** Last four characters, the only part ever shown. */
    last4: text("last4").notNull(),
    status: keyStatusEnum("status").notNull().default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** When off, runs use platform credits even though a key is saved. */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("provider_keys_user_provider_uq").on(t.userId, t.provider),
    check("provider_keys_last4_length", sql`char_length(${t.last4}) <= 4`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameVersionRow = typeof gameVersions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ProviderKeyRow = typeof providerKeys.$inferSelect;
