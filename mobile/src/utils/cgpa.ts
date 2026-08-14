import { getItem, setItem } from "./storage";

/**
 * CGPA Calculator & Predictor (spec §8) — Nigerian NUC 5-point scale,
 * confirmed: A = 70–100 (5), B = 60–69 (4), C = 50–59 (3), D = 45–49 (2),
 * E = 40–44 (1), F < 40 (0). CGPA = Σ(grade point × units) ÷ Σ(units).
 */

export interface CourseGrade {
  name: string;
  units: number;
  /** Raw score 0–100, converted via NUC bands. */
  score: number;
}

export function gradePoints(score: number): number {
  if (score >= 70) return 5;
  if (score >= 60) return 4;
  if (score >= 50) return 3;
  if (score >= 45) return 2;
  if (score >= 40) return 1;
  return 0;
}

export function gradeLabel(score: number): string {
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

export interface CgpaResult {
  cgpa: number;
  totalUnits: number;
  totalQualityPoints: number;
}

/** Aggregate a semester/transcript of course grades. */
export function calculateCgpa(courses: CourseGrade[]): CgpaResult {
  const totalUnits = courses.reduce((sum, c) => sum + c.units, 0);
  const totalQualityPoints = courses.reduce(
    (sum, c) => sum + gradePoints(c.score) * c.units,
    0,
  );
  return {
    cgpa: totalUnits === 0 ? 0 : totalQualityPoints / totalUnits,
    totalUnits,
    totalQualityPoints,
  };
}

export function cgpaClassification(cgpa: number): string {
  if (cgpa >= 4.5) return "First Class";
  if (cgpa >= 3.5) return "Second Class Upper";
  if (cgpa >= 2.4) return "Second Class Lower";
  if (cgpa >= 1.5) return "Third Class";
  if (cgpa >= 1.0) return "Pass";
  return "Below pass";
}

export interface PredictorInput {
  currentCgpa: number;
  unitsCompleted: number;
  targetCgpa: number;
  /** Number of future semesters in the chosen timeframe. */
  semesters: number;
  unitsPerSemester: number;
}

export type PredictorResult =
  | {
      reachable: true;
      gpRequired: number;
      /** Highest CGPA achievable with straight A's from here. */
      maxAchievableCgpa: number;
      /** 2–3 illustrative example grade combos that clear gpRequired. */
      examples: string[];
    }
  | {
      reachable: false;
      /** The CGPA achievable assuming straight A's in the timeframe. */
      maxAchievableCgpa: number;
      maxGpRequired: number;
    };

/**
 * Exact formula from the spec:
 *   QP₀        = CurrentCGPA × UnitsCompleted
 *   Uf         = units per semester × number of semesters
 *   QPt        = TargetCGPA × (UnitsCompleted + Uf)
 *   QPneeded   = QPt − QP₀
 *   GPrequired = QPneeded ÷ Uf
 */
export function predictGpaRequired(input: PredictorInput): PredictorResult {
  const { currentCgpa, unitsCompleted, targetCgpa, semesters, unitsPerSemester } =
    input;
  const uf = Math.max(1, semesters * unitsPerSemester);
  const qp0 = currentCgpa * unitsCompleted;
  const qpt = targetCgpa * (unitsCompleted + uf);
  const qpNeeded = qpt - qp0;
  const gpRequired = qpNeeded / uf;

  const maxAchievableCgpa =
    (qp0 + 5 * uf) / (unitsCompleted + uf);

  if (gpRequired > 5) {
    return {
      reachable: false,
      maxAchievableCgpa,
      maxGpRequired: gpRequired,
    };
  }

  return {
    reachable: true,
    gpRequired,
    maxAchievableCgpa,
    examples: exampleCombos(gpRequired),
  };
}

/**
 * Produce 2–3 illustrative letter-grade combinations that clear the required
 * average GP (spec: "all B's clears this", "3 A's with the rest at C also
 * clears this") — not an exhaustive enumeration.
 */
function exampleCombos(gpRequired: number): string[] {
  const out: string[] = [];
  const allAs = 5 >= gpRequired - 1e-9;
  const allBs = 4 >= gpRequired - 1e-9;
  const allCs = 3 >= gpRequired - 1e-9;

  if (allBs) {
    out.push(allAs ? "All A's clears it" : "All B's clears it");
  }
  if (allCs) {
    out.push("All C's clears it");
  }

  // Mixed combo: a A's and the rest C's (5a + 3(1-a) >= gpRequired)
  // → a >= (gpRequired − 3)/2. For gpRequired in (3,5], e.g. 4.2 → a ≥ 0.6.
  const fracA = Math.max(0, (gpRequired - 3) / 2);
  const needA = Math.ceil(fracA * 10) / 10; // in tenths
  if (needA > 0 && needA < 1) {
    const aPct = Math.round(needA * 100);
    out.push(
      `Around ${aPct}% A's with the rest at C clears it (e.g. ${Math.ceil(needA * 4)} of 4 courses at A)`,
    );
  } else if (needA <= 0) {
    // Already covered by all-C/all-B; add a reassuring mix.
    if (out.length < 3) out.push("A mix of B's and C's clears it");
  }

  // Tight cases just under 5: most courses at A with a couple of B's.
  if (gpRequired > 4.2 && out.length < 3) {
    out.push("Mostly A's with a couple of B's also clears it");
  }
  if (out.length === 0) {
    out.push("Straight A's clears it");
  }
  return out.slice(0, 3);
}

/** Persisted CGPA history rows (past-semester CGPAs). */
export interface CgpaHistoryRow {
  id: string;
  label: string;
  cgpa: number;
  totalUnits: number;
  at: number;
}

const HISTORY_KEY = "cgpa_history";

export async function getCgpaHistory(): Promise<CgpaHistoryRow[]> {
  try {
    const raw = await getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CgpaHistoryRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addCgpaHistory(
  row: Omit<CgpaHistoryRow, "id" | "at">,
): Promise<CgpaHistoryRow[]> {
  const next = [
    { ...row, id: `${Date.now().toString(36)}`, at: Date.now() },
    ...(await getCgpaHistory()),
  ].slice(0, 12);
  await setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearCgpaHistory(): Promise<void> {
  await setItem(HISTORY_KEY, JSON.stringify([]));
}
