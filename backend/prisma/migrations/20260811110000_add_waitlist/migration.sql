-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

-- CreateIndex
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries"("status");

-- CreateIndex
CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries"("created_at");
