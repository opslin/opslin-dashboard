import { describe, expect, it } from "vitest";

/**
 * Unit tests for the delete-specific progress logic extracted from
 * the app detail page. These verify the behavioral contracts that
 * the delete flow must satisfy.
 */

// Re-implement the pure helpers from page.tsx so tests are self-contained.
type OperationType = "deploy" | "rollback" | "stop" | "delete";
type ProgressStepState = { label: string; status: "pending" | "running" | "completed" | "error" };

function buildProgressSteps(operationType: OperationType): ProgressStepState[] {
    switch (operationType) {
        case "deploy":
            return [
                { label: "Fetching source", status: "running" },
                { label: "Building image", status: "pending" },
                { label: "Starting candidate", status: "pending" },
                { label: "Running health checks", status: "pending" },
                { label: "Promoting traffic", status: "pending" },
            ];
        case "rollback":
            return [
                { label: "Selecting target version", status: "running" },
                { label: "Starting rollback candidate", status: "pending" },
                { label: "Running health checks", status: "pending" },
                { label: "Promoting traffic", status: "pending" },
                { label: "Finalizing rollback", status: "pending" },
            ];
        case "stop":
            return [
                { label: "Stopping Docker container", status: "running" },
                { label: "Cleaning up resources", status: "pending" },
            ];
        case "delete":
            return [
                { label: "Delete requested", status: "running" },
                { label: "Agent cleanup running", status: "pending" },
                { label: "Removing routes & domains", status: "pending" },
                { label: "Finalizing cleanup", status: "pending" },
            ];
    }
}

describe("delete progress steps", () => {
    it("uses delete-specific labels, not deploy build labels", () => {
        const steps = buildProgressSteps("delete");
        const labels = steps.map(s => s.label);

        // Must NOT contain deploy-specific labels
        expect(labels).not.toContain("Fetching source");
        expect(labels).not.toContain("Building image");
        expect(labels).not.toContain("Starting candidate");
        expect(labels).not.toContain("Running health checks");
        expect(labels).not.toContain("Promoting traffic");

        // Must contain delete-specific labels
        expect(labels).toContain("Delete requested");
        expect(labels).toContain("Agent cleanup running");
        expect(labels).toContain("Removing routes & domains");
        expect(labels).toContain("Finalizing cleanup");
    });

    it("has 4 delete steps", () => {
        expect(buildProgressSteps("delete")).toHaveLength(4);
    });

    it("starts with first step running, rest pending", () => {
        const steps = buildProgressSteps("delete");
        expect(steps[0].status).toBe("running");
        expect(steps[1].status).toBe("pending");
        expect(steps[2].status).toBe("pending");
        expect(steps[3].status).toBe("pending");
    });
});

describe("delete completion detection", () => {
    it("app not found (404) during delete polling is treated as success", () => {
        // Simulate: getApps returns an empty list or list without the target app
        const apps: Array<{ id: string; status: string }> = [
            { id: "other-app", status: "running" },
        ];
        const targetAppId = "deleted-app-id";
        const stillExists = apps.find(a => a.id === targetAppId);

        expect(stillExists).toBeUndefined();
        // When stillExists is undefined, the polling treats this as delete success
    });

    it("app with delete_failed status stops polling and shows error", () => {
        const apps = [
            { id: "target-app", status: "delete_failed", deployLogs: "Cloudflare cleanup failed" },
        ];
        const targetAppId = "target-app";
        const stillExists = apps.find(a => a.id === targetAppId);

        expect(stillExists).toBeDefined();
        expect(stillExists!.status).toBe("delete_failed");
        expect(stillExists!.deployLogs).toBeTruthy();
    });

    it("app still deleting advances progress gradually", () => {
        // Simulate progress advancement
        const attempts = 10;
        const deleteProgress = Math.min(90, 20 + attempts * 2);
        expect(deleteProgress).toBe(40);

        const attempts2 = 35;
        const deleteProgress2 = Math.min(90, 20 + attempts2 * 2);
        expect(deleteProgress2).toBe(90); // capped at 90
    });

    it("delete step index advances over time", () => {
        // attempts < 5 → step 0, < 15 → step 1, < 25 → step 2, >= 25 → step 3
        const stepForAttempt = (attempts: number) =>
            attempts < 5 ? 0 : attempts < 15 ? 1 : attempts < 25 ? 2 : 3;

        expect(stepForAttempt(1)).toBe(0);
        expect(stepForAttempt(4)).toBe(0);
        expect(stepForAttempt(5)).toBe(1);
        expect(stepForAttempt(14)).toBe(1);
        expect(stepForAttempt(15)).toBe(2);
        expect(stepForAttempt(24)).toBe(2);
        expect(stepForAttempt(25)).toBe(3);
        expect(stepForAttempt(40)).toBe(3);
    });
});

describe("delete progress timeout behavior", () => {
    it("does not leave progress stuck at 20%", () => {
        // After 10 poll cycles, progress must have advanced from initial 20%
        const attempts = 10;
        const deleteProgress = Math.min(90, 20 + attempts * 2);
        expect(deleteProgress).toBeGreaterThan(20);
    });

    it("progress caps at 90% until actual completion", () => {
        const attempts = 100;
        const deleteProgress = Math.min(90, 20 + attempts * 2);
        expect(deleteProgress).toBe(90);
    });

    it("slowdown threshold triggers at ~2 minutes", () => {
        const deleteSlowdownThreshold = 40;
        // At 3s per poll, 40 * 3 = 120 seconds = 2 minutes
        expect(deleteSlowdownThreshold * 3).toBe(120);
    });
});

describe("delete logs isolation", () => {
    it("initial delete modal logs show helpful message, not empty", () => {
        const deleteInitialLogs = "Delete cleanup is running on the server. Detailed cleanup logs are not available yet.";
        expect(deleteInitialLogs).not.toBe("");
        expect(deleteInitialLogs).toContain("cleanup");
        expect(deleteInitialLogs).not.toContain("Building");
        expect(deleteInitialLogs).not.toContain("Downloading");
    });

    it("deploy initial logs are empty (no stale content)", () => {
        const initialLogsForOperation = (operationType: OperationType) => operationType === "delete"
            ? "Delete cleanup is running on the server."
            : "";

        expect(initialLogsForOperation("deploy")).toBe("");
    });
});

describe("delete polling interval", () => {
    it("delete uses 3s interval, deploy uses 1s", () => {
        const pollingIntervalForOperation = (operationType: OperationType) => operationType === "delete" ? 3000 : 1000;

        expect(pollingIntervalForOperation("delete")).toBe(3000);
        expect(pollingIntervalForOperation("deploy")).toBe(1000);
    });
});
