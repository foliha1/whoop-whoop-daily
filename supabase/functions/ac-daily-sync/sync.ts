// Pure sync implementation: imported by the Edge entrypoint and Vitest.
const LAUNCH = Date.UTC(2026, 7, 11);
export function puzzleNumberAt(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid date");
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - LAUNCH) / 86_400_000) + 1;
}

type RecordValue = { id: string; contact?: string; field?: string; value?: string; perstag?: string };
type Page = { meta?: { total?: string | number }; [key: string]: unknown };
export class ProviderError extends Error {
  constructor(public status: number, public details: string) { super(`ActiveCampaign [${status}]: ${details}`); }
}
export interface SyncOptions {
  base: string; key: string; listId: string; now?: Date; dryRun?: boolean;
  fetcher?: typeof fetch; wait?: (ms: number) => Promise<void>;
}

export async function syncDailyNumber(options: SyncOptions) {
  const { base, key, listId, dryRun = false } = options;
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (!/^https:\/\//.test(base) || !key || !/^\d+$/.test(listId)) throw new Error("ActiveCampaign configuration missing or invalid");
  const number = puzzleNumberAt(options.now ?? new Date());
  if (number < 1) throw new Error("Daily has not launched");
  const root = base.replace(/\/+$/, "").replace(/\/api\/3$/, "") + "/api/3";
  const started = Date.now();
  let requests = 0;
  async function request(path: string, method = "GET", body?: unknown): Promise<Page> {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() - started > 120_000) throw new Error("Sync time budget exceeded; next run safely retries remaining values");
      if (requests++) await wait(220); // Sequential requests stay below the provider's 5/second account cap.
      const res = await fetcher(root + path, {
        method, headers: { "Api-Token": key, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      if (res.status === 429 && attempt < 3) {
        const retry = Number(res.headers.get("Retry-After") ?? "2");
        if (!Number.isFinite(retry) || retry > 30) throw new ProviderError(res.status, text);
        await wait(Math.max(1, retry) * 1000); continue;
      }
      if (method === "GET" && res.status >= 500 && attempt < 3) { await wait(1000 * 2 ** attempt); continue; }
      if (!res.ok) throw new ProviderError(res.status, text);
      if (Number(res.headers.get("RateLimit-Remaining") ?? "100") < 3) await wait(1000);
      return JSON.parse(text) as Page;
    }
    throw new Error("Retry limit exceeded");
  }
  async function pages(path: string, resource: string): Promise<RecordValue[]> {
    const result: RecordValue[] = [];
    for (let offset = 0; offset < 100_000;) {
      const page = await request(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`);
      const records = page[resource];
      if (!Array.isArray(records)) throw new Error(`Invalid ${resource} response`);
      result.push(...records);
      offset += records.length;
      if (!records.length || (page.meta?.total !== undefined ? offset >= Number(page.meta.total) : records.length < 100)) return result;
    }
    throw new Error("Pagination safety limit exceeded");
  }
  const fields = await pages("/fields", "fields");
  const field = fields.find((item) => item.perstag?.toUpperCase() === "WWD_NUMBER");
  if (!field?.id) throw new Error("WWD_NUMBER field not found");
  // Active list membership only: never create contacts or re-subscribe an opted-out contact.
  const contacts = await pages(`/contacts?listid=${listId}&status=1`, "contacts");
  const unique = [...new Set(contacts.map((contact) => String(contact.id)))];
  let updated = 0, unchanged = 0;
  for (const contact of unique) {
    const values = await pages(`/contacts/${encodeURIComponent(contact)}/fieldValues`, "fieldValues");
    const value = values.find((item) => String(item.field) === String(field.id));
    if (value?.value === String(number)) { unchanged++; continue; }
    if (!dryRun) {
      const fieldValue = { contact, field: field.id, value: String(number) };
      // Never blindly replay a failed write. The next run reads the value first.
      await request(value?.id ? `/fieldValues/${encodeURIComponent(value.id)}` : "/fieldValues",
        value?.id ? "PUT" : "POST", { fieldValue });
    }
    updated++;
  }
  return { ok: true, date: (options.now ?? new Date()).toISOString().slice(0, 10), puzzleNumber: number,
    subscribers: unique.length, unchanged, updated: dryRun ? 0 : updated, wouldUpdate: dryRun ? updated : 0, dryRun };
}