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

    it("reports a fresh failure as truth instead of silently falling back to an older success", () => {
        // This was the exact bug behind a live "Your app is LIVE!" celebration + green
        // "Succeeded" badge appearing for a deploy that had actually just failed (against a
        // disconnected server): the previous version of selectCurrentDeploymentTruth searched
        // all of history for *any* succeeded/rolled_back deployment before ever checking
        // whether the newest attempt was itself terminal. Reporting a failure as a failure is
        // the entire point of a "current truth" selector — the previously-live version staying
        // up is a separate concern (DeploymentsSection's own `getLiveRelease`/`liveRelease`),
        // not something this selector should silently substitute in.
        const failed = deployment({
            id: "failed",
            status: "failed",
            startedAt: "2026-01-01T00:03:00.000Z",
            healthLog: "Agent not connected for server ip-172-31-2-13",
        });
        const live = deployment({
            id: "live",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:02:00.000Z",
        });

        expect(selectCurrentDeploymentTruth([failed, live])?.id).toBe("failed");
    });

    it("still prefers a genuinely live release over an aborted duplicate attempt", () => {
        const aborted = deployment({
            id: "aborted",
            status: "aborted",
            startedAt: "2026-01-01T00:03:00.000Z",
        });
        const live = deployment({
            id: "live",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
        });

        // The newest real attempt is still what gets reported, even when it's "aborted" rather
        // than "failed" — both are terminal failure states from the user's point of view.
        expect(selectCurrentDeploymentTruth([aborted, live])?.id).toBe("aborted");
    });
});
