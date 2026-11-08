// 1 Nov 2026: pressing "Clean and secure" on a server with no apps crashed the whole page ("Cannot read properties of null
// (reading 'filter')") because the agent sends `apps: null` for an empty list.
import { describe, expect, it } from "vitest";
import { summarize } from "../server-cleanup-modal";
import type { ServerCleanupResult } from "@/lib/api";

const base = { startedAt: "2026-11-01T00:00:00Z", finishedAt: "2026-11-01T00:01:00Z" };

describe("summarize a clean-up result", () => {
    it("copes with every list being null (a server with no apps)", () => {
        const result = { ...base, apps: null, prunes: null, hardening: { immediate: null, connectivityRisk: null } } as unknown as ServerCleanupResult;
        const { rows, failed, unhealthy } = summarize(result);
        expect(rows[0]).toBe("No stale Docker data to remove");
        expect(rows.some((row) => /No apps needed a health check/.test(row))).toBe(true);
        expect(failed).toEqual([]);
        expect(unhealthy).toEqual([]);
    });

    it("lists what was reclaimed, including the new leftover-image and build-cache steps", () => {
        const result = {
            ...base, apps: [],
            prunes: [{ step: "containers", reclaimedSpace: "0B" }, { step: "leftover_app_images", reclaimedSpace: "916.0MB" }, { step: "builder_cache", reclaimedSpace: "3.446GB" }],
            hardening: { immediate: [], connectivityRisk: [] },
        } as unknown as ServerCleanupResult;
        expect(summarize(result).rows[0]).toBe("Reclaimed 916.0MB + 3.446GB of disk space");
    });
});

// A step that could not finish (the build-cache trim was cut off on 1 Nov 2026) must be shown, not hidden behind "clean and secure".
describe("clean-up steps that did not finish", () => {
    it("names each step that reported an error, in plain words", () => {
        const result = {
            ...base, apps: [],
            prunes: [{ step: "containers", reclaimedSpace: "0B" }, { step: "builder_cache", reclaimedSpace: "", error: "context canceled" }, { step: "leftover_app_images", reclaimedSpace: "", error: "docker: not running" }],
            hardening: { immediate: [], connectivityRisk: [] },
        } as unknown as ServerCleanupResult;
        expect(summarize(result).unfinished).toEqual(["Build cache", "Leftover app images"]);
    });
    it("is empty when every step finished", () => {
        const result = { ...base, apps: [], prunes: [{ step: "images", reclaimedSpace: "1MB" }], hardening: { immediate: [], connectivityRisk: [] } } as unknown as ServerCleanupResult;
        expect(summarize(result).unfinished).toEqual([]);
    });
});
