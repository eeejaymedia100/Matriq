-- AlterTable
ALTER TABLE "users" ADD COLUMN "date_of_birth" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "verification_email_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "verification_email_window_start" TIMESTAMP(3);
