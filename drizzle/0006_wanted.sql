CREATE TYPE "public"."wanted_offer_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn', 'closed');--> statement-breakpoint
CREATE TYPE "public"."wanted_status" AS ENUM('open', 'fulfilled', 'closed', 'removed');--> statement-breakpoint
CREATE TABLE "wanted_offers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" bigint NOT NULL,
	"listing_id" bigint NOT NULL,
	"seller_id" bigint NOT NULL,
	"offered_by" bigint NOT NULL,
	"message" text,
	"status" "wanted_offer_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanted_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"buyer_id" bigint NOT NULL,
	"game_id" bigint NOT NULL,
	"title" text NOT NULL,
	"ranks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_level" integer,
	"capes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_min" integer,
	"budget_max" integer NOT NULL,
	"requirements" text,
	"preferred_agent_id" bigint,
	"status" "wanted_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"admin_note" text,
	"removed_by" bigint,
	"view_count" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wanted_requests_budget_positive" CHECK ("wanted_requests"."budget_max" > 0),
	CONSTRAINT "wanted_requests_budget_range" CHECK ("wanted_requests"."budget_min" is null or "wanted_requests"."budget_min" <= "wanted_requests"."budget_max")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wanted_request_id" bigint;--> statement-breakpoint
ALTER TABLE "wanted_offers" ADD CONSTRAINT "wanted_offers_request_id_wanted_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wanted_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_offers" ADD CONSTRAINT "wanted_offers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_offers" ADD CONSTRAINT "wanted_offers_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_offers" ADD CONSTRAINT "wanted_offers_offered_by_users_id_fk" FOREIGN KEY ("offered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_requests" ADD CONSTRAINT "wanted_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_requests" ADD CONSTRAINT "wanted_requests_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_requests" ADD CONSTRAINT "wanted_requests_preferred_agent_id_users_id_fk" FOREIGN KEY ("preferred_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanted_requests" ADD CONSTRAINT "wanted_requests_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wanted_offers_request_listing_uq" ON "wanted_offers" USING btree ("request_id","listing_id");--> statement-breakpoint
CREATE INDEX "wanted_offers_listing_idx" ON "wanted_offers" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "wanted_offers_offered_by_idx" ON "wanted_offers" USING btree ("offered_by");--> statement-breakpoint
CREATE INDEX "wanted_offers_request_idx" ON "wanted_offers" USING btree ("request_id","status");--> statement-breakpoint
CREATE INDEX "wanted_requests_list_idx" ON "wanted_requests" USING btree ("status","expires_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wanted_requests_buyer_idx" ON "wanted_requests" USING btree ("buyer_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wanted_request_id_wanted_requests_id_fk" FOREIGN KEY ("wanted_request_id") REFERENCES "public"."wanted_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_wanted_idx" ON "orders" USING btree ("wanted_request_id") WHERE "orders"."wanted_request_id" is not null;