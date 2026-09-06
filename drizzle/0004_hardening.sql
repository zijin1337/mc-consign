ALTER TYPE "public"."cancel_reason" ADD VALUE 'buyer_withdrawn';--> statement-breakpoint
ALTER TYPE "public"."cancel_reason" ADD VALUE 'listing_unavailable';--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_completed_uq" ON "orders" USING btree ("listing_id") WHERE "orders"."status" = 'completed';--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_positive" CHECK ("listings"."price" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_final_price_positive" CHECK ("orders"."final_price" is null or "orders"."final_price" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fees_non_negative" CHECK (coalesce("orders"."fee_calculated", 0) >= 0 and coalesce("orders"."fee_actual", 0) >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_credit_non_negative" CHECK ("users"."credit_score" >= 0);