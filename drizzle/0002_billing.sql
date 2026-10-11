CREATE TYPE "public"."billing_mode" AS ENUM('byok', 'credits');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('grant', 'expire', 'purchase', 'refund', 'reserve', 'release', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."purchase_kind" AS ENUM('pack', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'settled', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" "provider" NOT NULL,
	"billing_mode" "billing_mode" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"reserved_granted" integer DEFAULT 0 NOT NULL,
	"reserved_purchased" integer DEFAULT 0 NOT NULL,
	"sparks_charged" integer DEFAULT 0 NOT NULL,
	"sparks_overage" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "agent_runs_nonneg" CHECK ("agent_runs"."reserved_granted" >= 0 and "agent_runs"."reserved_purchased" >= 0 and "agent_runs"."sparks_charged" >= 0 and "agent_runs"."input_tokens" >= 0 and "agent_runs"."output_tokens" >= 0),
	CONSTRAINT "agent_runs_charge_within_hold" CHECK ("agent_runs"."sparks_charged" <= "agent_runs"."reserved_granted" + "agent_runs"."reserved_purchased")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'polar' NOT NULL,
	"external_id" text NOT NULL,
	"kind" "purchase_kind" NOT NULL,
	"offer" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"sparks" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spark_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"granted_delta" integer DEFAULT 0 NOT NULL,
	"purchased_delta" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"run_id" uuid,
	"purchase_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted" integer DEFAULT 0 NOT NULL,
	"purchased" integer DEFAULT 0 NOT NULL,
	"allowance" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_granted_nonneg" CHECK ("wallets"."granted" >= 0),
	CONSTRAINT "wallets_purchased_nonneg" CHECK ("wallets"."purchased" >= 0),
	CONSTRAINT "wallets_period_order" CHECK ("wallets"."period_end" > "wallets"."period_start")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spark_ledger" ADD CONSTRAINT "spark_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_created_idx" ON "agent_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_game_idx" ON "agent_runs" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_provider_external_uq" ON "purchases" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "purchases_user_created_idx" ON "purchases" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spark_ledger_idempotency_uq" ON "spark_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "spark_ledger_user_created_idx" ON "spark_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");