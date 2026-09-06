CREATE TABLE "mail_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"notification_id" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"path" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_images" ADD CONSTRAINT "pending_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_outbox_pending_idx" ON "mail_outbox" USING btree ("created_at") WHERE "mail_outbox"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "pending_images_user_idx" ON "pending_images" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_images_created_idx" ON "pending_images" USING btree ("created_at");