/**
 * Resource Audit Engine — the submission state machine.
 *
 * A pure, dependency-free module: no Prisma, no Nest, no storage. The state
 * machine is the single authority on which lifecycle transitions are legal;
 * the service never writes a status without going through assertTransition.
 *
 * Part 1 pipeline (happy path):
 *   received → validating → duplicate_check → extracting → auditing
 *     → pending_human_review → approved → reward_pending → reward_eligible
 *     → processing_library → published
 *
 * Terminal / side states:
 *   rejected          — human said no (terminal)
 *   failed            — a stage threw after retries (terminal; admin can reopen)
 *   needs_information — human asked the student for more context (waits)
 *   reward_ineligible — approved but no reward (library processing continues)
 *   ocr_processing    — future: image-only submissions; extracting may route here
 */

import { ResourceAuditStatus } from "../generated/prisma/client";

export const AUDIT_STATUS = ResourceAuditStatus;

export type AuditStatus = ResourceAuditStatus;

/**
 * The transition table. Keys = from-state, values = set of legal to-states.
 * Every transition the service ever performs must appear here — the tests
 * verify the pipeline actually follows this table.
 */
export const TRANSITIONS: Readonly<Record<AuditStatus, ReadonlySet<AuditStatus>>> = {
  received: new Set<AuditStatus>(["validating", "failed"]),
  validating: new Set<AuditStatus>(["duplicate_check", "failed"]),
  duplicate_check: new Set<AuditStatus>(["extracting", "rejected", "failed"]),
  extracting: new Set<AuditStatus>(["ocr_processing", "auditing", "failed"]),
  ocr_processing: new Set<AuditStatus>(["auditing", "failed"]),
  auditing: new Set<AuditStatus>(["pending_human_review", "approved", "failed"]),
  pending_human_review: new Set<AuditStatus>([
    "approved",
    "rejected",
    "needs_information",
  ]),
  needs_information: new Set<AuditStatus>(["pending_human_review", "failed"]),
  approved: new Set<AuditStatus>(["reward_pending", "reward_ineligible", "processing_library", "failed"]),
  reward_pending: new Set<AuditStatus>(["reward_eligible", "reward_ineligible", "failed"]),
  reward_eligible: new Set<AuditStatus>(["processing_library", "failed"]),
  reward_ineligible: new Set<AuditStatus>(["processing_library", "failed"]),
  processing_library: new Set<AuditStatus>(["published", "failed"]),
  // Terminal states — nothing flows out automatically. `failed` can be
  // reopened by an admin through retryStage (explicitly allowed below).
  rejected: new Set<AuditStatus>([]),
  published: new Set<AuditStatus>([]),
  failed: new Set<AuditStatus>([]),
};

/** States a submission can be retried from after a stage failure. */
export const RETRYABLE_STATES: ReadonlySet<AuditStatus> = new Set<AuditStatus>([
  AUDIT_STATUS.validating,
  AUDIT_STATUS.duplicate_check,
  AUDIT_STATUS.extracting,
  AUDIT_STATUS.ocr_processing,
  AUDIT_STATUS.auditing,
  AUDIT_STATUS.processing_library,
]);

/**
 * Human decisions and the transition each one triggers from
 * pending_human_review (the only state where a human decision is legal).
 */
export type HumanDecision = "approved" | "rejected" | "needs_information";

export const DECISION_TRANSITIONS: Readonly<
  Record<HumanDecision, AuditStatus>
> = {
  approved: AUDIT_STATUS.approved,
  rejected: AUDIT_STATUS.rejected,
  needs_information: AUDIT_STATUS.needs_information,
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: AuditStatus,
    public readonly to: AuditStatus,
  ) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Is from → to a legal transition? */
export function canTransition(from: AuditStatus, to: AuditStatus): boolean {
  return TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * Assert from → to is legal; throws InvalidTransitionError otherwise.
 * The service wraps DB writes with this so an illegal state can never be
 * persisted, even under concurrent retries.
 */
export function assertTransition(from: AuditStatus, to: AuditStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Terminal states — no automatic processing happens past these. */
export function isTerminal(status: AuditStatus): boolean {
  return (
    status === AUDIT_STATUS.rejected ||
    status === AUDIT_STATUS.published ||
    status === AUDIT_STATUS.failed
  );
}

/** States where the pipeline can pick the submission back up automatically. */
export function isRetryable(status: AuditStatus): boolean {
  return RETRYABLE_STATES.has(status);
}
