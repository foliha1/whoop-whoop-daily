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

export function normalizedDisplayName(value: string): string {
  return cleanDisplayName(value)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]/g, "")
    .replace(/[013457]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
    })[character] ?? character);
}

export const displayNameSchema = z.string()
  .transform(cleanDisplayName)
  .pipe(z.string().min(1).max(DISPLAY_NAME_MAX).refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value) && !blocked.has(normalizedDisplayName(value)),
    DISPLAY_NAME_ERROR,
  ));

export function validateDisplayName(value: string): { ok: true; name: string } | { ok: false; error: string } {
  const parsed = displayNameSchema.safeParse(value);
  return parsed.success ? { ok: true, name: parsed.data } : { ok: false, error: DISPLAY_NAME_ERROR };
}