CREATE TABLE IF NOT EXISTS "asset_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain_id" uuid NOT NULL,
	"cache" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "asset_snapshots" ADD CONSTRAINT "asset_snapshots_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_snapshots_domain_id_unique_idx" ON "asset_snapshots" USING btree ("domain_id");
