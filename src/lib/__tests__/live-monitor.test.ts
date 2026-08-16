import { describe, expect, it } from "vitest";
import { OFFLINE_METRICS_REFETCH_MS, resolveEffectiveHealthLabel, resolveMetricsRefetchInterval } from "../live-monitor";

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

    it("reports offline from serverConnected even when effectiveStatus is a non-\"running\" lifecycle status", () => {
        // Live bug: a failed deploy leaves App.status "error" (not "running"), so
        // computeEffectiveAppStatus passes effectiveStatus through as "error" instead of
        // overriding to "offline" — that override only fires for status === "running". Without
        // this direct serverConnected check, the widget fell through to the last-persisted
        // (days-stale) healthStatus and showed "Healthy" for a server confirmed disconnected.
        expect(
            resolveEffectiveHealthLabel({ healthStatus: "healthy", effectiveStatus: "error", serverConnected: false })
        ).toBe("offline");
    });

    it("serverConnected: false wins even over an explicit effectiveStatus of \"running\"", () => {
        expect(
            resolveEffectiveHealthLabel({ healthStatus: "healthy", effectiveStatus: "running", serverConnected: false })
        ).toBe("offline");
    });
});

describe("resolveMetricsRefetchInterval", () => {
    it("backs off to the offline interval once serverConnected is confirmed false", () => {
        expect(resolveMetricsRefetchInterval(false, 60_000)).toBe(OFFLINE_METRICS_REFETCH_MS);
    });

    it("uses the normal interval while connected", () => {
        expect(resolveMetricsRefetchInterval(true, 60_000)).toBe(60_000);
    });

    it("uses the normal interval when connectivity is unknown (no response yet)", () => {
        expect(resolveMetricsRefetchInterval(undefined, 60_000)).toBe(60_000);
    });
});
