-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InstitutionType" AS ENUM ('university', 'polytechnic', 'college_of_education');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: Institution
CREATE TABLE "institutions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "short_name" TEXT,
  "type" "InstitutionType" NOT NULL DEFAULT 'university',
  "state" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "institutions_name_key" ON "institutions"("name");

-- CreateTable: Faculty
CREATE TABLE "faculties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "faculties_institution_id_name_key" ON "faculties"("institution_id", "name");

-- CreateTable: Department
CREATE TABLE "departments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "faculty_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_faculty_id_name_key" ON "departments"("faculty_id", "name");

-- AlterTable: User
ALTER TABLE "users" ADD COLUMN "institution_id" UUID;

-- AlterTable: Association
ALTER TABLE "associations" ADD COLUMN "institution_id" UUID;
ALTER TABLE "associations" ADD COLUMN "department" TEXT;
ALTER TABLE "associations" ADD COLUMN "email" TEXT;
ALTER TABLE "associations" ADD COLUMN "password_hash" TEXT;
CREATE UNIQUE INDEX "associations_email_key" ON "associations"("email");

-- AlterTable: Payment
ALTER TABLE "payments" ADD COLUMN "developer_fee_kobo" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "associations" ADD CONSTRAINT "associations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE CASCADE ON UPDATE CASCADE;