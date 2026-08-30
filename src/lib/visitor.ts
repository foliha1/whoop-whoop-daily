const STORAGE_KEY = "ww_visitor_id";
const NAME_KEY = "ww_display_name";
let inMemoryId: string | null = null;
let inMemoryName: string | null = null;

function generateUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${((Math.random() * 4) | 8).toString(16)}${rnd(3)}-${rnd(12)}`;
}

export function getVisitorId(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      const fresh = generateUuid();
      localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    }
  } catch {
    // fall through
  }
  if (!inMemoryId) inMemoryId = generateUuid();
  return inMemoryId;
}

export function getDisplayName(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(NAME_KEY);
      if (v) return v;
    }
  } catch {
    // fall through
  }
  return inMemoryName ?? "";
}

export const DISPLAY_NAME_MAX = 6;

export function setDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, DISPLAY_NAME_MAX);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(NAME_KEY, trimmed);
    }
  } catch {
    // fall through
  }
  inMemoryName = trimmed;
  return trimmed;
}
