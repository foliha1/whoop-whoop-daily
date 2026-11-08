import { describe, expect, it, vi } from "vitest";
import { trackSignup } from "../../supabase/functions/ac-subscribe/activity";

function fixture() {
  return {
    email: "player@example.test", source: "home", puzzleNumber: 90, skip: false,
    record: vi.fn(async () => "activity-1"), finish: vi.fn(async () => {}),
    sync: vi.fn(async () => ({ ok: true, contactId: "contact-1" })),
    seed: vi.fn(async () => true),
  };
}
describe("subscriber activity outcomes", () => {
  it("records #90 and the actual successful seed time independently of signup", async () => {
    const f = fixture();
    expect(await trackSignup(f)).toEqual({ syncedToAc: true, numberSynced: true });
    expect(f.seed).toHaveBeenCalledWith("contact-1", 90);
    expect(f.record).toHaveBeenCalledWith(expect.objectContaining({ email_hint: "p***@example.test", puzzle_number: 90, ac_status: "pending" }));
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "succeeded", seed_status: "succeeded", seeded_at: expect.any(String) }));
  });
  it("records failed AC signup and never seeds", async () => {
    const f = fixture(); f.sync.mockResolvedValue({ ok: false, contactId: "contact-1" });
    expect(await trackSignup(f)).toEqual({ syncedToAc: false, numberSynced: false });
    expect(f.seed).not.toHaveBeenCalled();
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "failed", seed_status: "skipped", seeded_at: null }));
  });
  it("records thrown signup failures", async () => {
    const f = fixture(); f.sync.mockRejectedValue(new Error("offline"));
    await trackSignup(f);
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "failed", seed_status: "skipped" }));
  });
  it("does not claim a failed seed succeeded when AC signup succeeds", async () => {
    const f = fixture(); f.seed.mockResolvedValue(false);
    expect(await trackSignup(f)).toEqual({ syncedToAc: true, numberSynced: false });
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "succeeded", seed_status: "failed", seeded_at: null }));
  });
  it("records thrown seed failures independently", async () => {
    const f = fixture(); f.seed.mockRejectedValue(new Error("offline"));
    await trackSignup(f);
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "succeeded", seed_status: "failed" }));
  });
  it("skips number seeding when no number was supplied", async () => {
    const f = fixture(); await trackSignup({ ...f, puzzleNumber: null });
    expect(f.seed).not.toHaveBeenCalled();
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ puzzle_number: null, seed_status: "skipped" }));
  });
  it("labels test addresses skipped, never successful AC requests", async () => {
    const f = fixture(); await trackSignup({ ...f, skip: true });
    expect(f.sync).not.toHaveBeenCalled(); expect(f.seed).not.toHaveBeenCalled();
    expect(f.finish).toHaveBeenCalledWith("activity-1", expect.objectContaining({ ac_status: "skipped", seed_status: "skipped" }));
  });
  it("does not block AC signup if activity creation fails", async () => {
    const f = fixture(); f.record.mockRejectedValue(new Error("log unavailable"));
    expect(await trackSignup(f)).toEqual({ syncedToAc: true, numberSynced: true });
    expect(f.finish).not.toHaveBeenCalled();
  });
  it("does not change AC results if activity completion fails", async () => {
    const f = fixture(); f.finish.mockRejectedValue(new Error("log unavailable"));
    expect(await trackSignup(f)).toEqual({ syncedToAc: true, numberSynced: true });
  });
});