import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../src/components/settings/session-manager";
import { api } from "../src/lib/api";

const { pushMock, removeTokenMock } = vi.hoisted(() => ({
    pushMock: vi.fn(),
    removeTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

vi.mock("@/lib/auth", async () => {
    const actual = await vi.importActual("../src/lib/auth");
    return {
        ...actual,
        removeToken: removeTokenMock,
    };
});

function renderWithQuery(ui: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe("Phase 04 dashboard security UI", () => {
    beforeEach(() => {
        localStorage.clear();
        pushMock.mockReset();
        removeTokenMock.mockReset();
        vi.restoreAllMocks();
    });

    it("renders the active session list with the current badge", async () => {
        vi.spyOn(api, "getSessions").mockResolvedValue([
            {
                id: "session-1",
                device: "Chrome on macOS",
                ip: "127.0.0.1",
                lastActive: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isCurrent: true,
            },
        ]);

        renderWithQuery(<SessionManager />);

        expect(await screen.findByTestId("session-manager")).toBeInTheDocument();
        expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
        expect(screen.getByText("Current")).toBeInTheDocument();
    });

    it("redirects to login after revoking all sessions", async () => {
        vi.spyOn(api, "getSessions").mockResolvedValue([
            {
                id: "session-1",
                device: "Chrome on macOS",
                ip: "127.0.0.1",
                lastActive: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isCurrent: true,
            },
        ]);
        vi.spyOn(api, "revokeAllSessions").mockResolvedValue({
            success: true,
            revokedSessions: 1,
        });

        renderWithQuery(<SessionManager />);
        await screen.findByTestId("session-row-session-1");
        fireEvent.click(await screen.findByTestId("revoke-all-sessions"));

        await waitFor(() => {
            expect(api.revokeAllSessions).toHaveBeenCalledTimes(1);
            expect(removeTokenMock).toHaveBeenCalledTimes(1);
            expect(pushMock).toHaveBeenCalledWith("/login");
        });
    });

    it("redirects to login when the current session is revoked", async () => {
        vi.spyOn(api, "getSessions").mockResolvedValue([
            {
                id: "session-1",
                device: "Chrome on macOS",
                ip: "127.0.0.1",
                lastActive: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isCurrent: true,
            },
        ]);
        vi.spyOn(api, "revokeSession").mockResolvedValue({
            success: true,
            revokedCurrentSession: true,
        });

        renderWithQuery(<SessionManager />);
        fireEvent.click(await screen.findByTestId("revoke-session-session-1"));

        await waitFor(() => {
            expect(api.revokeSession).toHaveBeenCalledWith("session-1");
            expect(removeTokenMock).toHaveBeenCalledTimes(1);
            expect(pushMock).toHaveBeenCalledWith("/login");
        });
    });

    it("fetches sessions with cookies and without localStorage Authorization", async () => {
        localStorage.setItem("token", "session-token");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        } as Response));

        await api.getSessions();

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:4000/auth/sessions",
            expect.objectContaining({
                method: "GET",
                credentials: "include",
            })
        );
        expect(request.headers).not.toHaveProperty("Authorization");
    });
});
