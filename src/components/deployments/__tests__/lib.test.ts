import { describe, expect, it } from "vitest";
import type { AppWithServer, DeploymentRecord } from "@/lib/api";
import { buildItems, computeStats, filterItems, latestFailure, statusLabel } from "../lib";

const app = (id: string, over: Partial<AppWithServer> = {}) => ({ id, name: id, status: "running", server: { id: "s", name: "Prod" }, ...over }) as AppWithServer;
const dep = (id: string, status: DeploymentRecord["status"], hoursAgo: number, over: Partial<DeploymentRecord> = {}) =>
    ({ id, sha: `${id}abcdef`, status, startedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(), triggeredBy: "git", triggerMeta: {}, ...over }) as DeploymentRecord;

describe("deployments helpers", () => {
    const items = buildItems([
        { app: app("api"), deployments: [dep("a3", "running", 0.1), dep("a2", "succeeded", 3), dep("a1", "succeeded", 30)] },
        { app: app("web"), deployments: [dep("w2", "failed", 5), dep("w1", "succeeded", 50)] },
    ]);

    it("sorts newest first and marks the live version", () => {
        expect(items.map((i) => i.deployment.id)).toEqual(["a3", "a2", "w2", "a1", "w1"]);
        expect(items.find((i) => i.deployment.id === "a2")?.live).toBe(true);
        expect(items.find((i) => i.deployment.id === "a2")?.rollbackTo?.id).toBe("a1");
        expect(items.find((i) => i.deployment.id === "w1")?.live).toBe(true);
        expect(items.find((i) => i.deployment.id === "a1")?.live).toBe(false);
    });

    it("computes honest stats for the last 7 days", () => {
        const stats = computeStats(items);
        expect(stats.runningCount).toBe(1);
        expect(stats.failedThisWeek).toBe(1);
        expect(stats.successRate).toBe(75);
        expect(stats.finishedThisWeek).toBe(4);
        expect(computeStats([]).successRate).toBeNull();
    });

    it("filters by status, app and text", () => {
        expect(filterItems(items, { query: "", status: "failed", appId: "all" })).toHaveLength(1);
        expect(filterItems(items, { query: "", status: "all", appId: "web" })).toHaveLength(2);
        expect(filterItems(items, { query: "a1abc", status: "all", appId: "all" })).toHaveLength(1);
    });

    it("finds a failure that nothing newer fixed", () => {
        expect(latestFailure(items)?.deployment.id).toBe("w2");
        const fixed = buildItems([{ app: app("web"), deployments: [dep("w3", "succeeded", 1), dep("w2", "failed", 5)] }]);
        expect(latestFailure(fixed)).toBeNull();
    });

    it("labels statuses", () => {
        expect(statusLabel(items[0]).label).toBe("Deploying");
        expect(statusLabel(items[1]).label).toBe("Live");
        expect(statusLabel(items[2]).label).toBe("Failed");
        expect(statusLabel(items[3]).label).toBe("Succeeded");
    });
});
