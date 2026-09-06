CREATE TABLE "hypixel_players" (
	"uuid" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" jsonb NOT NULL,
	"skyblock" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "mc_uuid" varchar(32);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "api_snapshot" jsonb;--> statement-breakpoint
CREATE INDEX "hypixel_players_name_idx" ON "hypixel_players" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "listings_mc_uuid_idx" ON "listings" USING btree ("mc_uuid");