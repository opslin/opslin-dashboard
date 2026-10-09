import { describe, expect, it } from "vitest";
import { computeSetup } from "../use-setup";

describe("computeSetup", () => {
    it("starts at the server step", () => {
        const s = computeSetup({ servers: 0, githubConnected: false, apps: 0 });
        expect(s.done).toBe(0);
        expect(s.current).toBe("server");
        expect(s.complete).toBe(false);
    });

    it("moves on to GitHub after a server is connected", () => {
        const s = computeSetup({ servers: 1, githubConnected: false, apps: 0 });
        expect(s.done).toBe(1);
        expect(s.current).toBe("github");
    });

    it("does not count GitHub before a server exists", () => {
        expect(computeSetup({ servers: 0, githubConnected: true, apps: 0 }).done).toBe(0);
    });

    it("is complete once an app exists", () => {
        const s = computeSetup({ servers: 1, githubConnected: true, apps: 2 });
        expect(s.complete).toBe(true);
        expect(s.current).toBeNull();
    });
});
