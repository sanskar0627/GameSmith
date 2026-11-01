CREATE TABLE "published_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"files" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_files" (
	"build_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "published_files_build_id_path_pk" PRIMARY KEY("build_id","path")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "published_build_id" uuid;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "welcomed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "published_builds" ADD CONSTRAINT "published_builds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_files" ADD CONSTRAINT "published_files_build_id_published_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."published_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "published_builds_game_idx" ON "published_builds" USING btree ("game_id","created_at" DESC NULLS LAST);