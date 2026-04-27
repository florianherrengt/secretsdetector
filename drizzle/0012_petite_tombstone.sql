DROP INDEX "findings_check_id_fingerprint_idx";--> statement-breakpoint
CREATE INDEX "findings_scan_id_idx" ON "findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "login_tokens_token_hash_idx" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "scans_domain_id_started_at_idx" ON "scans" USING btree ("domain_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_domains_user_id_idx" ON "user_domains" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_domains_domain_idx" ON "user_domains" USING btree ("domain");