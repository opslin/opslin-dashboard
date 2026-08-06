import { describe, expect, it } from "vitest";
import { resolveEffectiveHealthLabel } from "../live-monitor";

describe("resolveEffectiveHealthLabel", () => {
    it("reports offline when effectiveStatus says the server is disconnected, even if healthStatus still says healthy", () => {
        // This is the exact bug reported live: a disconnected server's Metrics tab kept
        // showing "Healthy" because it only ever read the last-persisted healthStatus row,
        // which stops updating the instant the agent disconnects.
        expect(resolveEffectiveHealthLabel({ healthStatus: "healthy", effectiveStatus: "offline" })).toBe("offline");
    });

    it("reports stale when effectiveStatus flags an overdue health check", () => {
        expect(resolveEffectiveHealthLabel({ healthStatus: "healthy", effectiveStatus: "stale" })).toBe("stale");
    });

    it("reports unhealthy from effectiveStatus", () => {
        expect(resolveEffectiveHealthLabel({ healthStatus: "unhealthy", effectiveStatus: "unhealthy" })).toBe("unhealthy");
    });

    it("falls back to the raw healthStatus when effectiveStatus is just \"running\" (nothing wrong)", () => {
        expect(resolveEffectiveHealthLabel({ healthStatus: "healthy", effectiveStatus: "running" })).toBe("healthy");
    });

    it("falls back to raw healthStatus when effectiveStatus is absent (older API response shape)", () => {
        expect(resolveEffectiveHealthLabel({ healthStatus: "unhealthy" })).toBe("unhealthy");
    });

    it("defaults to unknown when given nothing", () => {
        expect(resolveEffectiveHealthLabel(undefined)).toBe("unknown");
        expect(resolveEffectiveHealthLabel({})).toBe("unknown");
    });
});
