import { describe, expect, it } from "vitest";
import { CASCADE_ORDER } from "@/components/CardWaterfall";

describe("About card cascade", () => {
  it("cascades all 48 distinct cards", () => expect(new Set(CASCADE_ORDER).size).toBe(48));
});
