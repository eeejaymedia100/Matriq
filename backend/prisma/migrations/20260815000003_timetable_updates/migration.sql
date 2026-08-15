-- Matriq — real-time class/timetable updates (round-2 QA §2)
-- Executives/class reps push department+level-scoped timetable changes that
-- reflect in students' Timetable and fire an in-app notification.
-- Run date: 2026-08-15

CREATE TABLE "timetable_updates" (
    "id" UUID NOT NULL,
    "association_id" UUID NOT NULL,
    "author_executive_id" UUID NOT NULL,
    "department" TEXT,
    "level" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "timetable_updates_association_id_department_level_idx"
    ON "timetable_updates"("association_id", "department", "level");

ALTER TABLE "timetable_updates"
    ADD CONSTRAINT "timetable_updates_association_id_fkey"
    FOREIGN KEY ("association_id") REFERENCES "associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_updates"
    ADD CONSTRAINT "timetable_updates_author_executive_id_fkey"
    FOREIGN KEY ("author_executive_id") REFERENCES "association_executives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
