import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../src/hooks/use-auth";
import { api } from "../src/lib/api";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

function Probe() {
    const { user, loading, isAuthenticated, refetch } = useAuth();

    return (
        <div>
            <div data-testid="loading">{loading ? "loading" : "ready"}</div>
            <div data-testid="auth">{isAuthenticated ? "yes" : "no"}</div>
            <div data-testid="user">{user?.email ?? "none"}</div>
            <div data-testid="admin">{user?.isPlatformAdmin ? "yes" : "no"}</div>
            <button type="button" onClick={() => void refetch()}>refetch</button>
        </div>
    );
}

describe("useAuth", () => {
    beforeEach(() => {
        localStorage.clear();
        pushMock.mockReset();
        vi.restoreAllMocks();
    });

    it("calls /auth/me without requiring a localStorage token", async () => {
        vi.spyOn(api, "getMe").mockResolvedValue({
            id: "user-1",
            email: "cookie-user@test.com",
            name: "Cookie User",
            onboardingCompleted: true,
            emailVerified: true,
            createdAt: new Date().toISOString(),
        });

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));

        expect(screen.getByTestId("auth")).toHaveTextContent("yes");
        expect(screen.getByTestId("user")).toHaveTextContent("cookie-user@test.com");
        expect(api.getMe).toHaveBeenCalledTimes(1);
    });

    it("clears legacy localStorage token after successful /auth/me", async () => {
        localStorage.setItem("token", "old-token");
        vi.spyOn(api, "getMe").mockResolvedValue({
            id: "user-1",
            email: "cleanup@test.com",
            name: "Cleanup User",
            onboardingCompleted: true,
            emailVerified: true,
            createdAt: new Date().toISOString(),
        });

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));

        expect(localStorage.getItem("token")).toBeNull();
        expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    it("sets user null and authenticated false on auth failure", async () => {
        localStorage.setItem("token", "stale-token");
        vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthorized"));

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));

        expect(screen.getByTestId("auth")).toHaveTextContent("no");
        expect(screen.getByTestId("user")).toHaveTextContent("none");
        expect(localStorage.getItem("token")).toBeNull();
    });

    it("preserves an existing user on transient /auth/me network errors", async () => {
        vi.spyOn(api, "getMe")
            .mockResolvedValueOnce({
                id: "user-1",
                email: "stable@test.com",
                name: "Stable User",
                onboardingCompleted: true,
                emailVerified: true,
                createdAt: new Date().toISOString(),
            })
            .mockRejectedValueOnce(new TypeError("Failed to fetch"));

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("yes"));
        fireEvent.click(screen.getByRole("button", { name: "refetch" }));

        await waitFor(() => expect(api.getMe).toHaveBeenCalledTimes(2));

        expect(screen.getByTestId("auth")).toHaveTextContent("yes");
        expect(screen.getByTestId("user")).toHaveTextContent("stable@test.com");
    });

    it("exposes isPlatformAdmin from /auth/me for admin routing", async () => {
        vi.spyOn(api, "getMe").mockResolvedValue({
            id: "admin-1",
            email: "admin@test.com",
            name: "Admin User",
            onboardingCompleted: true,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            isPlatformAdmin: true,
        });

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));

        expect(screen.getByTestId("auth")).toHaveTextContent("yes");
        expect(screen.getByTestId("admin")).toHaveTextContent("yes");
    });
});
