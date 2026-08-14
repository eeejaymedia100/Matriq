import { getItem, setItem } from "./storage";

/**
 * My To-Do's completion state (spec §6). Each card on Home disappears the
 * moment its underlying task is genuinely completed — not when the screen is
 * merely visited. Completion lives here so any screen can mark it and Home
 * re-renders automatically.
 */
export type TodoId = "timetable" | "offlineAi" | "materials" | "photo";

const TODOS_KEY = "todos_done";

export type TodoState = Record<TodoId, boolean>;

const EMPTY: TodoState = {
  timetable: false,
  offlineAi: false,
  materials: false,
  photo: false,
};

export async function getTodoState(): Promise<TodoState> {
  try {
    const raw = await getItem(TODOS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<TodoState>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export async function markTodoDone(id: TodoId): Promise<TodoState> {
  const state = await getTodoState();
  state[id] = true;
  await setItem(TODOS_KEY, JSON.stringify(state));
  return state;
}

export async function allTodosDone(): Promise<boolean> {
  const state = await getTodoState();
  return state.timetable && state.offlineAi && state.materials && state.photo;
}
