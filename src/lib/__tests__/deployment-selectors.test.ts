import { describe, expect, it } from "vitest";
import type { DeploymentRecord } from "@/lib/api";
import { isLockBusyDeployment, selectCurrentDeploymentTruth } from "../deployment-selectors";

function deployment(overrides: Partial<DeploymentRecord>): DeploymentRecord {
    return {
        id: "deployment-1",
        sha: "abc123",
        status: "pending",
        startedAt: "2026-01-01T00:00:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
        ...overrides,
    };
}

describe("deployment selectors", () => {
    it("detects lock-busy wording from skipped duplicate attempts", () => {
        expect(isLockBusyDeployment(deployment({
            status: "failed",
            healthLog: "Another deployment was already running",
        }))).toBe(true);
    });

    it("keeps a real failure as truth when a newer duplicate was skipped", () => {
        const skipped = deployment({
            id: "skipped",
            status: "failed",
            healthLog: "Another deployment was already running",
            startedAt: "2026-01-01T00:02:00.000Z",
        });
        const failed = deployment({
            id: "failed",
            status: "failed",
            healthLog: "Job timed out",
            startedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(selectCurrentDeploymentTruth([skipped, failed])?.id).toBe("failed");
    });

    it("prefers active deployments over terminal attempts", () => {
        const failed = deployment({ id: "failed", status: "failed" });
        const running = deployment({ id: "running", status: "running" });

        expect(selectCurrentDeploymentTruth([failed, running])?.id).toBe("running");
    });

    it("keeps the last live release selected when a newer deployment fails", () => {
        const failed = deployment({
            id: "failed",
            status: "failed",
            startedAt: "2026-01-01T00:03:00.000Z",
            healthLog: "Build step failed",
        });
        const live = deployment({
            id: "live",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:02:00.000Z",
        });

        expect(selectCurrentDeploymentTruth([failed, live])?.id).toBe("live");
    });
});
