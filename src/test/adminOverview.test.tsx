import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("recharts", async () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, LineChart: Stub, BarChart: Stub, Line: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub };
});

import { AdminOverviewView, pct, type Overview } from "@/components/AdminOverview";
import { isPreviewHost } from "@/lib/previewHost";
import { FONT_FAMILY, FONT_FAMILY_UI } from "@/lib/tokens";

const data = JSON.parse(readFileSync(resolve(__dirname, "fixtures-admin-overview.json"), "utf8")) as Overview;

describe("Admin overview", () => {
  it("shows lifetime players by format, returns, list, sharing, sources and trend", () => {
    render(<AdminOverviewView data={data} hideMine onHideMineChange={() => {}} onTagBrowser={() => {}} />);
    expect(screen.getByText("1,589")).toBeInTheDocument();
    expect(screen.getByText("people have played Whoop! Whoop!")).toBeInTheDocument();
    expect(screen.getByText("played all three · 164 played 2 or more")).toBeInTheDocument();
    expect(screen.getByText("18 of 108 came back on Nov 19", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Daily results screen")).toBeInTheDocument();
    expect(screen.getByText("pre-order cart clicks · 0 today")).toBeInTheDocument();
    const playlin = screen.getByText("playlin.io").closest("tr")!;
    expect(within(playlin).getByText("0 · 0%")).toBeInTheDocument();
    expect(screen.getByText("Together players")).toBeInTheDocument();
    expect(screen.getByText("24 admin and test browsers left out")).toBeInTheDocument();
  });

  it("lets an admin show everyone or tag this browser", () => {
    const onHide = vi.fn();
    const onTag = vi.fn();
    render(<AdminOverviewView data={data} hideMine onHideMineChange={onHide} onTagBrowser={onTag} />);
    fireEvent.click(screen.getByLabelText("Hide my activity"));
    expect(onHide).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "This Is Me" }));
    expect(onTag).toHaveBeenCalledWith(true);
  });

  it("uses Friend for headers and Geist for content and controls", () => {
    render(<AdminOverviewView data={data} hideMine onHideMineChange={() => {}} onTagBrowser={() => {}} />);
    expect(screen.getByRole("heading", { name: "Players" })).toHaveStyle({ fontFamily: FONT_FAMILY });
    expect(screen.getByText("1,589")).toHaveStyle({ fontFamily: FONT_FAMILY_UI });
    expect(screen.getByRole("button", { name: "This Is Me" })).toHaveStyle({ fontFamily: FONT_FAMILY_UI });
  });

  it("rounds rates and never divides by zero", () => {
    expect(pct(18, 108)).toBe("17%");
    expect(pct(0, 0)).toBe("–");
  });
});

describe("Preview hosts", () => {
  it("skips Lovable previews but counts the public game and local runs", () => {
    expect(isPreviewHost("id-preview--a1be2228.lovable.app")).toBe(true);
    expect(isPreviewHost("a1be2228.lovableproject.com")).toBe(true);
    expect(isPreviewHost("whoop-whoop.lovable.app")).toBe(false);
    expect(isPreviewHost("whoop-whoop.com")).toBe(false);
    expect(isPreviewHost("localhost")).toBe(false);
  });
});
