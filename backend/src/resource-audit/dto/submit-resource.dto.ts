import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

/**
 * Resource Audit Engine — external API contracts.
 *
 * `source` is deliberately absent: the submitting channel sets it server-side
 * (the app submits `app`; the future Telegram bot will submit `telegram`),
 * so a client can never spoof where a submission came from.
 */

export const MATERIAL_TYPES = [
  "past_question",
  "lecture_note",
  "handout",
  "slide_deck",
  "textbook_summary",
  "other",
] as const;

export class SubmitResourceDto {
  /** e.g. "CHM 101" — normalized and shape-checked by the service. */
  @IsString()
  @Length(3, 16)
  courseCode!: string;

  @IsIn(MATERIAL_TYPES)
  materialType!: (typeof MATERIAL_TYPES)[number];

  /** "I have the right to share this material." Required, recorded with a version. */
  @IsBoolean()
  rightsDeclared!: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  level?: string;

  /** e.g. "2023/2024" */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}\/\d{4}$/, { message: "academicSession must look like 2023/2024" })
  academicSession?: string;

  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  faculty?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  department?: string;
}

export class DecideSubmissionDto {
  @IsIn(["approved", "rejected", "needs_information"])
  decision!: "approved" | "rejected" | "needs_information";

  /** Required for rejected / needs_information — enforced again in the service. */
  @IsOptional()
  @IsString()
  @Length(4, 500)
  reason?: string;
}

export class ReviewQueueQueryDto {
  @IsOptional()
  @IsIn([
    "pending_human_review",
    "approved",
    "rejected",
    "needs_information",
    "reward_pending",
    "reward_eligible",
    "reward_ineligible",
    "processing_library",
    "published",
    "failed",
    "received",
    "validating",
    "duplicate_check",
    "extracting",
    "ocr_processing",
    "auditing",
  ])
  status?: string;

  @IsOptional()
  @IsIn(["green", "yellow", "red"])
  risk?: string;

  @IsOptional()
  @IsIn(["approve", "reject", "review"])
  aiRecommendation?: string;

  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 16)
  courseCode?: string;

  @IsOptional()
  @IsIn(MATERIAL_TYPES)
  materialType?: string;

  @IsOptional()
  @IsString()
  take?: string;
}

export class ReopenDto {
  @IsOptional()
  @IsString()
  @Length(0, 300)
  note?: string;
}

export class NotesDto {
  @IsString()
  @Length(1, 2000)
  notes!: string;
}

export class PayoutDto {
  @IsIn(["airtime", "bank_transfer"])
  payoutMethod!: "airtime" | "bank_transfer";

  @IsString()
  @Length(3, 120)
  payoutRef!: string;
}

export class DisputeDto {
  @IsString()
  @Length(4, 300)
  note!: string;
}
