ALTER TABLE "findings" ADD COLUMN "check_id" text NOT NULL DEFAULT 'generic-secret';
ALTER TABLE "findings" ALTER COLUMN "check_id" DROP DEFAULT;
