CREATE TYPE "public"."aftersale_result" AS ENUM('refund', 'negotiated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."aftersale_status" AS ENUM('open', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."blacklist_type" AS ENUM('qq', 'phone');--> statement-breakpoint
CREATE TYPE "public"."cancel_reason" AS ENUM('buyer_quit', 'seller_quit', 'mismatch', 'price_disagree', 'sold_elsewhere', 'other');--> statement-breakpoint
CREATE TYPE "public"."code_purpose" AS ENUM('register', 'reset_password', 'change_qq');--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('deal', 'manual', 'aftersale', 'no_show', 'ban');--> statement-breakpoint
CREATE TYPE "public"."fee_mode" AS ENUM('all_in', 'exclusive');--> statement-breakpoint
CREATE TYPE "public"."listing_source" AS ENUM('self_bought', 'mfa', 'second_hand');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('pending_review', 'on_sale', 'rejected', 'off_shelf', 'in_trade', 'sold', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_assign', 'pending_contact', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'agent', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'banned');--> statement-breakpoint
CREATE TABLE "aftersales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"opened_by" bigint NOT NULL,
	"description" text NOT NULL,
	"status" "aftersale_status" DEFAULT 'open' NOT NULL,
	"result" "aftersale_result",
	"result_note" text,
	"seller_at_fault" boolean,
	"handled_by" bigint,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"operator_id" bigint NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" bigint,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banned_words" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "blacklist_type" NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"source_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason_type" "credit_reason" NOT NULL,
	"reason_text" text NOT NULL,
	"ref_type" text,
	"ref_id" bigint,
	"operator_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"attr_schema" jsonb NOT NULL,
	"title_template" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" bigint NOT NULL,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seller_id" bigint NOT NULL,
	"game_id" bigint NOT NULL,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"fee_mode" "fee_mode" NOT NULL,
	"source" "listing_source" NOT NULL,
	"has_transaction_id" boolean NOT NULL,
	"contact" text NOT NULL,
	"note" text,
	"preferred_agent_id" bigint,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "listing_status" DEFAULT 'pending_review' NOT NULL,
	"review_note" text,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"dirty_since_approval" boolean DEFAULT false NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" bigint NOT NULL,
	"buyer_id" bigint NOT NULL,
	"seller_id" bigint NOT NULL,
	"agent_id" bigint,
	"status" "order_status" NOT NULL,
	"buyer_message" text,
	"final_price" integer,
	"fee_calculated" integer,
	"fee_actual" integer,
	"fee_override_reason" text,
	"cancel_reason" "cancel_reason",
	"cancel_note" text,
	"cancelled_by" bigint,
	"warranty_until" date,
	"agent_note" text,
	"assigned_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(16) NOT NULL,
	"password_hash" text NOT NULL,
	"qq" varchar(12) NOT NULL,
	"qq_verified_at" timestamp with time zone,
	"phone" varchar(11) NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"credit_score" integer DEFAULT 100 NOT NULL,
	"deal_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"no_show_locked_until" timestamp with time zone,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"ban_reason" text,
	"ban_until" timestamp with time zone,
	"username_changed_at" timestamp with time zone,
	"avatar_path" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"agent_intro" text,
	"agent_accepting" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "code_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aftersales" ADD CONSTRAINT "aftersales_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aftersales" ADD CONSTRAINT "aftersales_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aftersales" ADD CONSTRAINT "aftersales_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_words" ADD CONSTRAINT "banned_words_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist" ADD CONSTRAINT "blacklist_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_logs" ADD CONSTRAINT "credit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_logs" ADD CONSTRAINT "credit_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_preferred_agent_id_users_id_fk" FOREIGN KEY ("preferred_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aftersales_order_idx" ON "aftersales" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "audit_logs_operator_idx" ON "audit_logs" USING btree ("operator_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "banned_words_word_uq" ON "banned_words" USING btree ("word");--> statement-breakpoint
CREATE UNIQUE INDEX "blacklist_type_value_uq" ON "blacklist" USING btree ("type","value");--> statement-breakpoint
CREATE INDEX "credit_logs_user_idx" ON "credit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_code_uq" ON "games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "listing_images_listing_idx" ON "listing_images" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "listings_list_idx" ON "listings" USING btree ("status","pinned" DESC NULLS LAST,"weight" DESC NULLS LAST,"approved_at");--> statement-breakpoint
CREATE INDEX "listings_seller_idx" ON "listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listings_attrs_gin" ON "listings" USING gin ("attrs");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_open_per_buyer_uq" ON "orders" USING btree ("listing_id","buyer_id") WHERE "orders"."status" in ('pending_assign', 'pending_contact', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_in_progress_uq" ON "orders" USING btree ("listing_id") WHERE "orders"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "orders_agent_idx" ON "orders" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_listing_idx" ON "orders" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_qq_uq" ON "users" USING btree ("qq");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "verification_codes_target_idx" ON "verification_codes" USING btree ("target","purpose","created_at");