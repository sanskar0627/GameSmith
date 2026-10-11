CREATE TYPE "public"."game_status" AS ENUM('draft', 'building', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."game_visibility" AS ENUM('private', 'link');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'forge', 'studio');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('ready', 'error');--> statement-breakpoint
CREATE TABLE "game_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"label" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"status" "version_status" NOT NULL,
	"files_changed" integer DEFAULT 0 NOT NULL,
	"snapshot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_versions_number_positive" CHECK ("game_versions"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"pitch" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT '' NOT NULL,
	"status" "game_status" DEFAULT 'draft' NOT NULL,
	"visibility" "game_visibility" DEFAULT 'private' NOT NULL,
	"cover_seed" integer DEFAULT floor(random() * 2147483647)::int NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "games_title_length" CHECK (char_length("games"."title") between 1 and 120),
	CONSTRAINT "games_current_version_nonneg" CHECK ("games"."current_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"run_id" uuid,
	"role" "message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"image_url" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_versions" ADD CONSTRAINT "game_versions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_versions_game_number_uq" ON "game_versions" USING btree ("game_id","number");--> statement-breakpoint
CREATE INDEX "games_owner_updated_idx" ON "games" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_game_created_idx" ON "messages" USING btree ("game_id","created_at");