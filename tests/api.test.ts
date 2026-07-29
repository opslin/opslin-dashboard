import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { login, register } from "../src/lib/auth";

describe("ApiClient", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.stubGlobal("fetch", vi.fn());
    });

    it("login ignores the returned token and does not write localStorage", async () => {
        const setItemSpy = vi.spyOn(localStorage, "setItem");
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                token: "stored-token",
                user: { id: "user-1", email: "test@test.com", name: "Test User" },
            }),
        } as Response);

        await api.login("test@test.com", "TestPassword123!");

        expect(setItemSpy).not.toHaveBeenCalledWith("token", "stored-token");
        expect(localStorage.getItem("token")).toBeNull();
    });

    it("auth helpers ignore login and register response tokens", async () => {
        const setItemSpy = vi.spyOn(localStorage, "setItem");
        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    token: "login-token",
                    user: { id: "user-1", email: "test@test.com", name: "Test User" },
                }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    token: "register-token",
                    user: { id: "user-2", email: "new@test.com", name: "New User" },
                }),
            } as Response);

        await login("test@test.com", "TestPassword123!");
        await register("new@test.com", "TestPassword123!", "New User");

        expect(setItemSpy).not.toHaveBeenCalledWith("token", expect.any(String));
        expect(localStorage.getItem("token")).toBeNull();
    });

    it("authenticated requests use cookies without localStorage Authorization", async () => {
        localStorage.setItem("token", "auth-token");
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => [],
        } as Response);

        await api.getServers();

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:4000/servers",
            expect.objectContaining({
                method: "GET",
                credentials: "include",
            })
        );
        expect(request.headers).not.toHaveProperty("Authorization");
    });

    it("401 response removes token", async () => {
        localStorage.setItem("token", "stale-token");
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ message: "Unauthorized" }),
        } as Response);

        await expect(api.getServers()).rejects.toThrow("Unauthorized");
        expect(localStorage.getItem("token")).toBeNull();
    });

    it("/auth/me 401 removes token without hard redirecting auth pages", async () => {
        window.history.pushState({}, "", "/register");
        localStorage.setItem("token", "stale-token");
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ message: "Unauthorized" }),
        } as Response);

        await expect(api.getMe()).rejects.toThrow("Unauthorized");
        expect(localStorage.getItem("token")).toBeNull();
        expect(window.location.pathname).toBe("/register");
    });

    it("logout clears localStorage", async () => {
        localStorage.setItem("token", "logout-token");
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ message: "Logged out" }),
        } as Response);

        await api.logout();

        expect(localStorage.getItem("token")).toBeNull();
        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:4000/auth/logout",
            expect.objectContaining({
                method: "POST",
                credentials: "include",
            })
        );
    });

    it("demo start relies on the auth cookie and does not write localStorage", async () => {
        const setItemSpy = vi.spyOn(localStorage, "setItem");
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                token: "demo-token",
                expiresAt: new Date().toISOString(),
                loginUrl: "http://localhost:3000/?demo=1",
                user: { id: "demo-user", email: "demo@test.local", name: "Demo User" },
                organization: { id: "org-1", name: "Demo Org", slug: "demo-org" },
                server: { id: "server-1", name: "Demo VPS", status: "CONNECTED" },
                app: { id: "app-1", name: "Demo API", status: "RUNNING" },
            }),
        } as Response);

        await api.startDemo();

        expect(setItemSpy).not.toHaveBeenCalledWith("token", "demo-token");
        expect(localStorage.getItem("token")).toBeNull();
        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:4000/demo/start",
            expect.objectContaining({
                method: "POST",
                credentials: "include",
            })
        );
    });

    it("handles network errors gracefully", async () => {
        vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

        await expect(api.getServers()).rejects.toThrow("Network error");
    });
});
