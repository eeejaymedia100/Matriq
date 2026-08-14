import { getItem, setItem } from "./storage";

/**
 * Deadline tracker (spec §9 extras — Study). Local, offline-first list of
 * upcoming submissions with due dates.
 */
export interface Deadline {
  id: string;
  title: string;
  course?: string;
  dueAt: number; // epoch ms
  done: boolean;
}

const DEADLINES_KEY = "deadlines";

export async function getDeadlines(): Promise<Deadline[]> {
  try {
    const raw = await getItem(DEADLINES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Deadline[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addDeadline(
  d: Omit<Deadline, "id" | "done">,
): Promise<Deadline[]> {
  const next = [
    { ...d, id: `${Date.now().toString(36)}`, done: false },
    ...(await getDeadlines()),
  ].sort((a, b) => a.dueAt - b.dueAt);
  await setItem(DEADLINES_KEY, JSON.stringify(next));
  return next;
}

export async function toggleDeadline(id: string): Promise<Deadline[]> {
  const next = (await getDeadlines()).map((d) =>
    d.id === id ? { ...d, done: !d.done } : d,
  );
  await setItem(DEADLINES_KEY, JSON.stringify(next));
  return next;
}

export async function removeDeadline(id: string): Promise<Deadline[]> {
  const next = (await getDeadlines()).filter((d) => d.id !== id);
  await setItem(DEADLINES_KEY, JSON.stringify(next));
  return next;
}

export function deadlineStatus(d: Deadline, now: Date = new Date()): {
  label: string;
  urgent: boolean;
} {
  if (d.done) return { label: "Done", urgent: false };
  const diff = d.dueAt - now.getTime();
  if (diff < 0) return { label: "Overdue", urgent: true };
  const days = Math.ceil(diff / 86_400_000);
  if (days === 0) return { label: "Due today", urgent: true };
  if (days === 1) return { label: "Due tomorrow", urgent: true };
  return { label: `In ${days} days`, urgent: days <= 3 };
}
