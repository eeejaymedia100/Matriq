import { getItem, setItem } from "./storage";

/**
 * Timetable (spec §9 #3). A lightweight weekly timetable stored on-device:
 * courses by weekday + time slot, plus a "next class" resolver used by Home.
 */
export interface TimetableEntry {
  id: string;
  title: string;
  /** 0 = Monday … 6 = Sunday (matches Date#getDay mapping minus Sunday-first). */
  day: number;
  /** Minutes from midnight, e.g. 9:30 → 570. */
  startMin: number;
  endMin: number;
  location?: string;
}

const TIMETABLE_KEY = "timetable_entries";

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function labelToMinutes(label: string): number | null {
  // Accepts "9:30 AM", "14:00", "9am" …
  const m = label
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const period = m[3]?.toLowerCase();
  if (h < 0 || h > 23 || min > 59) return null;
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  if (!period && h > 23) return null;
  return h * 60 + min;
}

export async function getTimetable(): Promise<TimetableEntry[]> {
  try {
    const raw = await getItem(TIMETABLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TimetableEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTimetable(
  entries: TimetableEntry[],
): Promise<void> {
  await setItem(TIMETABLE_KEY, JSON.stringify(entries));
}

export async function addTimetableEntry(
  entry: Omit<TimetableEntry, "id">,
): Promise<TimetableEntry[]> {
  const next = [...(await getTimetable()), { ...entry, id: uid() }];
  await saveTimetable(next);
  return next;
}

export async function removeTimetableEntry(
  id: string,
): Promise<TimetableEntry[]> {
  const next = (await getTimetable()).filter((e) => e.id !== id);
  await saveTimetable(next);
  return next;
}

/**
 * The next upcoming class from `now`, or null. Monday = 0 so we can compare
 * directly with the entry's `day` field.
 */
export function nextClass(
  entries: TimetableEntry[],
  now: Date = new Date(),
): TimetableEntry | null {
  if (entries.length === 0) return null;
  const jsDay = now.getDay(); // 0 = Sunday
  const today = jsDay === 0 ? 6 : jsDay - 1; // normalise to Monday=0
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Today's remaining classes, earliest first.
  const laterToday = entries
    .filter((e) => e.day === today && e.startMin >= nowMin)
    .sort((a, b) => a.startMin - b.startMin);
  if (laterToday.length > 0) return laterToday[0];

  // Otherwise the next day with any class.
  for (let offset = 1; offset <= 7; offset++) {
    const day = (today + offset) % 7;
    const onDay = entries.filter((e) => e.day === day).sort(
      (a, b) => a.startMin - b.startMin,
    );
    if (onDay.length > 0) return onDay[0];
  }
  return null;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
