-- Participant profile: faculty + department collected in the upload wizard.
ALTER TABLE "telegram_participants" ADD COLUMN "faculty" TEXT;
ALTER TABLE "telegram_participants" ADD COLUMN "department" TEXT;
