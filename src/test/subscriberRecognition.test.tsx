// A typed or stored email is never identity. The old recognition helpers are
// retired: they must answer "nothing known" without asking the server.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-x" }));

import {
  emailHasHistory,
  fetchServerSubscriberEmail,
  getSubscribedEmail,
  markSubscribed,
} from "@/lib/dailySubscribe";

beforeEach(() => {
  rpc.mockReset();
  localStorage.clear();
});

describe("server-side recognition by visitor id is retired", () => {
  it("never returns an address for a visitor id", async () => {
    rpc.mockResolvedValue({ data: "someone@example.com", error: null });
    await expect(fetchServerSubscriberEmail("visitor-x")).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a locally stored or typed address is not treated as signed in", () => {
    markSubscribed("someone@example.com");
    localStorage.setItem("ww_daily_email", "someone@example.com");
    expect(getSubscribedEmail()).toBeNull();
  });
});

describe("email_has_history is retired", () => {
  it("reveals nothing about any address and never asks the server", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(emailHasHistory("someone@example.com")).resolves.toBe(false);
    await expect(emailHasHistory("junk")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
