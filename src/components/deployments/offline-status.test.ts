import { describe, expect, it } from "vitest";
import { statusLabel, type DeploymentItem } from "./lib";

const item = (over: Partial<DeploymentItem> & { connected?: boolean } = {}): DeploymentItem => ({
    deployment: { id: "d1", status: "succeeded", sha: "abc", startedAt: new Date().toISOString() } as never,
    app: { id: "a", name: "x", status: "running", server: { id: "s", name: "n", isLiveConnected: over.connected ?? true } } as never,
    live: over.live ?? true,
    rollbackTo: null,
});

describe("deployment status label with an offline server", () => {
    it("says Live only while the server is connected", () => {
        expect(statusLabel(item({ connected: true })).label).toBe("Live");
    });
    it("says Server offline, never Live, when the server is offline", () => {
        const l = statusLabel(item({ connected: false }));
        expect(l.label).toBe("Server offline");
        expect(l.tone).toBe("warning");
    });
    it("leaves old, non-live deployments as Succeeded", () => {
        expect(statusLabel(item({ connected: false, live: false })).label).toBe("Succeeded");
    });
});
