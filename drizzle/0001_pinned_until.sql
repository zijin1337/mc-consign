DROP INDEX "listings_list_idx";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "pinned_until" timestamp with time zone;--> statement-breakpoint
UPDATE "listings" SET "pinned_until" = now() + interval '30 days' WHERE "pinned" = true;--> statement-breakpoint
CREATE INDEX "listings_pinned_idx" ON "listings" USING btree ("pinned_until") WHERE "listings"."pinned_until" is not null;--> statement-breakpoint
CREATE INDEX "listings_list_idx" ON "listings" USING btree ("status","weight" DESC NULLS LAST,"approved_at");