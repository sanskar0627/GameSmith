ALTER TABLE "agent_runs" ADD COLUMN "prompt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_one_running_uq" ON "agent_runs" USING btree ("game_id") WHERE "agent_runs"."status" = 'running';