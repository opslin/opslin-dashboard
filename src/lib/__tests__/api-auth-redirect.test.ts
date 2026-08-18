import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

function mockFetchOnce(status: number, body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }) as unknown as typeof fetch;
}

describe("401 handling on public vs. authenticated endpoints", () => {
    let originalLocation: Location;

    beforeEach(() => {
        originalLocation = window.location;
        // Replace with a plain object so assigning `.href` just records the
        // value instead of triggering jsdom's unimplemented navigation.
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...originalLocation, href: "http://localhost:3000/login" },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: originalLocation,
        });
        vi.restoreAllMocks();
    });

    it("does not hard-redirect on a failed login (wrong password) so the error toast survives", async () => {
        mockFetchOnce(401, { message: "Invalid email or password" });

        await expect(api.login("user@example.com", "wrong-password")).rejects.toThrow(
            "Invalid email or password"
        );

        expect(window.location.href).toBe("http://localhost:3000/login");
    });

    it("still hard-redirects to /login on a 401 from an authenticated endpoint (expired session)", async () => {
        mockFetchOnce(401, { message: "Unauthorized" });

        await expect(api.getSessions()).rejects.toThrow();

        expect(window.location.href).toBe("/login");
    });
});
