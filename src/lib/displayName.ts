import { z } from "zod";

export const DISPLAY_NAME_MAX = 6;
export const DISPLAY_NAME_ERROR = "Try another name.";

const blocked = new Set([
  "bitch", "chink", "cock", "cunt", "dick", "fag", "faggot", "fuck",
  "fucker", "kike", "nigga", "nigger", "penis", "pussy", "retard",
  "shit", "shitty", "slut", "spic", "twat", "vagina", "whore",
]);

export function cleanDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Length in Unicode code points — the same unit the server's char_length uses. */
export function displayNameLength(value: string): number {
  return [...value].length;
}

/** Cut typed input to the name limit by code points (never splits a character). */
export function sliceDisplayName(value: string, max = DISPLAY_NAME_MAX): string {
  return [...value].slice(0, max).join("");
}

// Mirrors public.display_name_allowed on the server.
const CONTROL = /\p{Cc}/u;
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{Nd}]/u;

export function normalizedDisplayName(value: string): string {
  return cleanDisplayName(value)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]/g, "")
    .replace(/[013457]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
    })[character] ?? character);
}

export function isDisplayNameAllowed(raw: string): boolean {
  if (CONTROL.test(raw) || INVISIBLE.test(raw)) return false;
  const value = cleanDisplayName(raw);
  const length = displayNameLength(value);
  if (length < 1 || length > DISPLAY_NAME_MAX) return false;
  if (!LETTER_OR_NUMBER.test(value)) return false;
  return !blocked.has(normalizedDisplayName(value));
}

export const displayNameSchema = z.string()
  .refine(isDisplayNameAllowed, DISPLAY_NAME_ERROR)
  .transform(cleanDisplayName);

export function validateDisplayName(value: string): { ok: true; name: string } | { ok: false; error: string } {
  const parsed = displayNameSchema.safeParse(value);
  return parsed.success ? { ok: true, name: parsed.data } : { ok: false, error: DISPLAY_NAME_ERROR };
}
