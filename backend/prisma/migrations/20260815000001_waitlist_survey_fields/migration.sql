-- Matriq — waitlist growth survey (waitlist launch package §3)
-- Collect the "most annoying part of studying" insight + identify association
-- executives (for the Founding Circle) at signup, not via a separate recruit.
-- Run date: 2026-08-15

ALTER TABLE "waitlist_entries" ADD COLUMN "pain_point" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "is_association_exec" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "waitlist_entries" ADD COLUMN "exec_level" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "exec_department" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "exec_faculty" TEXT;
