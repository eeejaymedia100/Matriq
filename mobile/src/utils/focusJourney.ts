import { getItem, setItem } from "./storage";
import type { FocusMap, JourneyStage } from "../offline/focus";

/**
 * Focus Mode learning journey (UI direction §Focus Mode).
 *
 * A map's journey is an ordered partition of its nodes into stages. Cloud
 * maps carry `stages` from the backend; offline/legacy maps fall back to one
 * linear stage. Progress (which concepts were opened, which stage checkpoints
 * were passed) is persisted per map id so a student can leave and resume.
 */

export interface JourneyProgress {
  /** Stage ids whose mastery checkpoint has been passed. */
  passedStageIds: string[];
  /** Node ids the student has opened/read in the journey. */
  openedConceptIds: string[];
}

const EMPTY: JourneyProgress = { passedStageIds: [], openedConceptIds: [] };

export function emptyJourneyProgress(): JourneyProgress {
  return { ...EMPTY, passedStageIds: [], openedConceptIds: [] };
}

/** Ordered journey stages — the backend's when present, else one linear stage. */
export function journeyStagesOf(map: FocusMap): JourneyStage[] {
  if (map.stages && map.stages.length > 0) {
    return map.stages;
  }
  return [
    {
      id: "whole-journey",
      title: "Explore the topic",
      objective: "Open each idea and read its explanation.",
      conceptIds: map.nodes.map((n) => n.id),
    },
  ];
}

/**
 * First stage whose checkpoint hasn't been passed yet — that's where the
 * student continues. If every stage is passed, the journey is complete.
 */
export function currentStageIndex(
  stages: JourneyStage[],
  progress: JourneyProgress,
): number {
  const firstUnpassed = stages.findIndex(
    (s) => !progress.passedStageIds.includes(s.id),
  );
  return firstUnpassed === -1 ? stages.length - 1 : firstUnpassed;
}

export function isJourneyComplete(
  stages: JourneyStage[],
  progress: JourneyProgress,
): boolean {
  return (
    stages.length > 0 &&
    stages.every((s) => progress.passedStageIds.includes(s.id))
  );
}

export async function getJourneyProgress(
  mapId: string,
): Promise<JourneyProgress> {
  try {
    const raw = await getItem(`focus_journey_${mapId}`);
    if (!raw) return emptyJourneyProgress();
    const parsed = JSON.parse(raw) as Partial<JourneyProgress>;
    return {
      passedStageIds: Array.isArray(parsed.passedStageIds)
        ? parsed.passedStageIds
        : [],
      openedConceptIds: Array.isArray(parsed.openedConceptIds)
        ? parsed.openedConceptIds
        : [],
    };
  } catch {
    return emptyJourneyProgress();
  }
}

export async function saveJourneyProgress(
  mapId: string,
  progress: JourneyProgress,
): Promise<void> {
  await setItem(
    `focus_journey_${mapId}`,
    JSON.stringify(progress),
  ).catch(() => {});
}

/** The checkpoint question shown for a concept — mirrors the server wording. */
export function checkpointQuestionFor(
  conceptLabel: string,
  topic: string,
): string {
  return `Explain "${conceptLabel}" in your own words — what it is, how it works, and why it matters in "${topic}".`;
}