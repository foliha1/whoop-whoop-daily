import { describe, expect, it } from "vitest";
import { filterCards } from "@/components/CardGallery";

describe("About card gallery filters", () => {
  it("shows all 48 cards unfiltered", () => expect(filterCards(null, null, null)).toHaveLength(48));
  it("one shape gives 12", () => expect(filterCards("star", null, null)).toHaveLength(12));
  it("one number gives 12", () => expect(filterCards(null, 3, null)).toHaveLength(12));
  it("one color gives 16", () => expect(filterCards(null, null, "red")).toHaveLength(16));
  it("all three narrow to one card", () => expect(filterCards("tri", 2, "blue").map((c) => c.id)).toEqual(["tri-2-blue"]));
});
