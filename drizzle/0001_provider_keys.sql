CREATE TYPE "public"."key_status" AS ENUM('valid', 'invalid', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('anthropic', 'openai', 'openrouter', 'fal');--> statement-breakpoint
CREATE TABLE "provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "provider" NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"last4" text NOT NULL,
	"status" "key_status" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_last4_length" CHECK (char_length("provider_keys"."last4") <= 4)
);
--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_keys_user_provider_uq" ON "provider_keys" USING btree ("user_id","provider");