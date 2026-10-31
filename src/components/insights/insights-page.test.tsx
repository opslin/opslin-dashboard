import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { duration, InsightsBody, percent, prettyKey } from "./insights-page";
import type { DeployInsights } from "@/lib/insights-types";

const base: DeployInsights = {
    rangeDays: 30, total: 6, succeeded: 4, failed: 1, aborted: 1, successRate: 0.8, retried: 1, withDatabase: 2, aiCalls: 1, aiInputTokens: 3000, aiOutputTokens: 4000,
    byStack: [{ key: "node", total: 4, succeeded: 3, failed: 1, successRate: 0.75, avgDurationMs: 130_000 }, { key: "unknown", total: 2, succeeded: 1, failed: 0, successRate: 1, avgDurationMs: null }],
    byPath: [{ key: "dil", total: 1, succeeded: 1, failed: 0, successRate: 1, avgDurationMs: 60_000 }, { key: "compose", total: 2, succeeded: 2, failed: 0, successRate: 1, avgDurationMs: null }],
    byRam: [{ key: "4GB", total: 6, succeeded: 4, failed: 1, successRate: 0.8, avgDurationMs: null }],
    failureClasses: [{ key: "out_of_memory", count: 1 }],
    daily: [{ day: "2026-10-16", total: 2, failed: 0 }, { day: "2026-10-17", total: 4, failed: 1 }],
};

describe("deploy insights", () => {
    it("formats numbers in plain words", () => {
        expect(percent(0.756)).toBe("76% worked");
        expect(percent(null)).toBe("no result yet");
        expect(duration(130_000)).toBe("2m 10s");
        expect(duration(45_000)).toBe("45s");
        expect(duration(null)).toBeNull();
        expect(prettyKey("out_of_memory")).toBe("Out of memory");
        expect(prettyKey("php")).toBe("PHP");
    });

    it("shows one headline, the rows, and friendly names", () => {
        render(<InsightsBody data={base} />);
        expect(screen.getByRole("heading", { name: "80% of deploys worked" })).toBeTruthy();
        expect(screen.getByText("Node.js")).toBeTruthy();
        expect(screen.getByText("Not detected")).toBeTruthy();
        expect(screen.getByText("AI-assisted deploy")).toBeTruthy();
        expect(screen.getByText("Compose project")).toBeTruthy();
        expect(screen.getByText("Out of memory")).toBeTruthy();
        expect(screen.getByText(/4 worked, 1 failed, 1 stopped in the last 30 days/)).toBeTruthy();
        expect(screen.getByText("1 · 7,000 tokens")).toBeTruthy();
    });

    it("invites the first deploy when there is nothing yet", () => {
        render(<InsightsBody data={{ ...base, total: 0, successRate: null, byStack: [], byPath: [], byRam: [], failureClasses: [], daily: [] }} />);
        expect(screen.getByText("No deploys recorded yet")).toBeTruthy();
    });
});
