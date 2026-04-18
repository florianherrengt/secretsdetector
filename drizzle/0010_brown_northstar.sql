ALTER TABLE "findings" DROP CONSTRAINT "findings_scan_id_scans_id_fk";
--> statement-breakpoint
ALTER TABLE "scans" DROP CONSTRAINT "scans_domain_id_domains_id_fk";
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;