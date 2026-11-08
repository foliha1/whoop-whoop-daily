import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { ProviderError, puzzleNumberAt, syncDailyNumber } from "../../supabase/functions/ac-daily-sync/sync";

beforeAll(() => vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal }));
afterAll(() => vi.unstubAllGlobals());

const now = new Date("2026-11-08T22:49:00Z");
function fixture(respond?: (url: string, method: string) => Response | undefined) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const override = respond?.(url, method);
    if (override) return override;
    let data: unknown = {};
    if (url.includes("/fields?")) data = { fields: [{ id: "2", perstag: "WWD_NUMBER" }], meta: { total: "1" } };
    else if (url.includes("/contacts?")) data = { contacts: [{ id: "10" }, { id: "11" }], meta: { total: "2" } };
    else if (url.includes("/contacts/10/")) data = { fieldValues: [{ id: "50", field: "2", value: "82" }] };
    else if (url.includes("/contacts/11/")) data = { fieldValues: [{ id: "51", field: "2", value: "90" }] };
    return Response.json(data);
  }) as unknown as typeof fetch;
  return { calls, options: { base: "https://example.invalid", key: "test-only", listId: "1", now, fetcher, wait: async () => {} } };
}
describe("ActiveCampaign Daily number sync", () => {
  it("anchors puzzle #1 to August 11, 2026", () => expect(puzzleNumberAt(new Date("2026-08-11T00:00Z"))).toBe(1));
  it("writes #90 for November 8, not an increment of the stale #82", async () => {
    const { calls, options } = fixture();
    expect(await syncDailyNumber(options)).toMatchObject({ puzzleNumber: 90, updated: 1, unchanged: 1 });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([{ url: "https://example.invalid/api/3/fieldValues/50", method: "PUT", body: { fieldValue: { contact: "10", field: "2", value: "90" } } }]);
  });
  it("rolls to #91 exactly at UTC midnight", () => {
    expect(puzzleNumberAt(new Date("2026-11-08T23:59:59Z"))).toBe(90);
    expect(puzzleNumberAt(new Date("2026-11-09T00:00:00Z"))).toBe(91);
  });
  it("reads only active configured-list contacts and never changes subscriptions", async () => {
    const { calls, options } = fixture(); await syncDailyNumber(options);
    expect(calls.some((c) => c.url.includes("/contacts?listid=1&status=1&limit=100&offset=0"))).toBe(true);
    expect(calls.filter((c) => c.method !== "GET").every((c) => c.url.includes("/fieldValues"))).toBe(true);
  });
  it("dry run reports corrections without writes", async () => {
    const { calls, options } = fixture();
    expect(await syncDailyNumber({ ...options, dryRun: true })).toMatchObject({ updated: 0, wouldUpdate: 1 });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("creates a missing field value", async () => {
    const { calls, options } = fixture((url) => url.includes("/contacts/10/") ? Response.json({ fieldValues: [] }) : undefined);
    await syncDailyNumber(options);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ fieldValue: { contact: "10", field: "2", value: "90" } });
  });
  it("continues pagination using the string total, even for a short page", async () => {
    const { calls, options } = fixture((url) => url.includes("/contacts?") ? Response.json({ contacts: [{ id: url.includes("offset=0") ? "10" : "11" }], meta: { total: "2" } }) : undefined);
    await syncDailyNumber(options);
    expect(calls.some((c) => c.url.includes("/contacts?") && c.url.includes("offset=1"))).toBe(true);
  });
  it("surfaces provider write failures without replaying an ambiguous write", async () => {
    const { calls, options } = fixture((_url, method) => method === "PUT" ? new Response("provider unavailable", { status: 503 }) : undefined);
    await expect(syncDailyNumber(options)).rejects.toBeInstanceOf(ProviderError);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
  it("honors Retry-After on throttled reads", async () => {
    let first = true;
    const { options } = fixture(() => { if (first) { first = false; return new Response("slow down", { status: 429, headers: { "Retry-After": "3" } }); } });
    const wait = vi.fn(async () => {});
    await syncDailyNumber({ ...options, wait }); expect(wait).toHaveBeenCalledWith(3000);
  });
});