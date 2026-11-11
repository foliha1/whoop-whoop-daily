import React from "react";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RulesPage from "@/pages/RulesPage";

const renderRules = () => render(
  <HelmetProvider>
    <MemoryRouter>
      <RulesPage />
    </MemoryRouter>
  </HelmetProvider>,
);

describe("physical game rulebook", () => {
  it("links the three rulebook destinations and shows six Quick Start steps", () => {
    const { container } = renderRules();

    expect(screen.getByRole("link", { name: "Quick Start" })).toHaveAttribute("href", "#quick-start");
    expect(screen.getByRole("link", { name: "Full Rules" })).toHaveAttribute("href", "#full-rules");
    expect(screen.getByRole("link", { name: "Sticky Situations" })).toHaveAttribute("href", "#sticky");
    expect(container.querySelector("#quick-start ol")?.children).toHaveLength(6);
    expect(container.querySelector("#full-rules")).toBeInTheDocument();
    expect(container.querySelector("#sticky")).toBeInTheDocument();
  });

  it("shows the video placeholder until the single video URL is supplied", () => {
    renderRules();

    expect(screen.getByText("Video coming soon")).toBeInTheDocument();
    expect(document.querySelector("video")).not.toBeInTheDocument();
  });

  it("registers Rules above the catch-all with the same entry music policy as About", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const rulesRoute = app.indexOf('<Route path="/rules"');
    const catchAll = app.indexOf('<Route path="*"');

    expect(rulesRoute).toBeGreaterThan(-1);
    expect(rulesRoute).toBeLessThan(catchAll);
    expect(app).toContain('const entryMusic = umbrella && path !== "/"');
    expect(app).not.toContain('path !== "/about"');
    expect(app).not.toContain('path !== "/rules"');
  });
});
