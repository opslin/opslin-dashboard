import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

/**
 * Validates: Requirements 10.5
 *
 * The dashboard typed API client surfaces the new buildpack endpoints:
 *   - GET   /servers/:id/apps/:appId/buildpack/versions
 *   - PATCH /servers/:id/apps/:appId/buildpack/pin
 *
 * These tests assert each method targets the correct path with the correct
 * method and body so the dashboard stays wired to the API contract added
 * in Section 10 of the design.
 */

const SERVER_ID = "srv-123";
const APP_ID = "app-456";

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response;
}

describe("ApiClient buildpack version pinning", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.stubGlobal("fetch", vi.fn());
    });

    it("listBuildpackVersions issues a GET to the buildpack/versions path and returns the parsed payload", async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ versions: ["1.0.0", "1.1.0", "1.2.0"] })
        );

        const result = await api.listBuildpackVersions(SERVER_ID, APP_ID);

        expect(result).toEqual({ versions: ["1.0.0", "1.1.0", "1.2.0"] });
        expect(fetch).toHaveBeenCalledTimes(1);

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe(
            `http://localhost:4000/servers/${SERVER_ID}/apps/${APP_ID}/buildpack/versions`
        );
        expect((init as RequestInit).method).toBe("GET");
        expect((init as RequestInit).body).toBeUndefined();
    });

    it("updateBuildpackPin with a version string PATCHes the pin endpoint with { version }", async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({
                id: APP_ID,
                name: "checkout-api",
                status: "running",
                buildpackVersion: "1.0.0",
                buildpackVersionPin: "1.0.0",
                createdAt: "2026-01-01T00:00:00.000Z",
            })
        );

        const result = await api.updateBuildpackPin(SERVER_ID, APP_ID, "1.0.0");

        expect(result.id).toBe(APP_ID);
        expect(result.buildpackVersionPin).toBe("1.0.0");
        expect(fetch).toHaveBeenCalledTimes(1);

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe(
            `http://localhost:4000/servers/${SERVER_ID}/apps/${APP_ID}/buildpack/pin`
        );
        expect((init as RequestInit).method).toBe("PATCH");
        expect((init as RequestInit).body).toBe(JSON.stringify({ version: "1.0.0" }));
    });

    it("updateBuildpackPin with null PATCHes the pin endpoint with { version: null } to clear the pin", async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({
                id: APP_ID,
                name: "checkout-api",
                status: "running",
                buildpackVersion: "1.2.0",
                buildpackVersionPin: null,
                createdAt: "2026-01-01T00:00:00.000Z",
            })
        );

        const result = await api.updateBuildpackPin(SERVER_ID, APP_ID, null);

        expect(result.buildpackVersionPin).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe(
            `http://localhost:4000/servers/${SERVER_ID}/apps/${APP_ID}/buildpack/pin`
        );
        expect((init as RequestInit).method).toBe("PATCH");
        expect((init as RequestInit).body).toBe(JSON.stringify({ version: null }));
    });
});
