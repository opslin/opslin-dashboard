import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../src/app/(auth)/login/page";
import RegisterPage from "../src/app/(auth)/register/page";
import ForgotPasswordPage from "../src/app/forgot-password/page";
import ResetPasswordPage from "../src/app/reset-password/page";
import { api, type User } from "../src/lib/api";

const navigationMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: navigationMocks.push,
        replace: navigationMocks.replace,
    }),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: "user-1",
        email: "operator@example.com",
        name: "Operator",
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: "2026-05-11T00:00:00.000Z",
        ...overrides,
    };
}

describe("auth page guard", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        window.history.pushState({}, "", "/");
    });

    it("redirects a logged-in verified user away from login", async () => {
        window.history.pushState({}, "", "/login");
        vi.spyOn(api, "getMe").mockResolvedValue(makeUser());

        render(<LoginPage />);

        expect(screen.getByRole("status", { name: "Checking session" })).toBeInTheDocument();
        await waitFor(() => {
            expect(navigationMocks.replace).toHaveBeenCalledWith("/dashboard");
        });
        expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
    });

    it("redirects a logged-in verified user away from register", async () => {
        window.history.pushState({}, "", "/register");
        vi.spyOn(api, "getMe").mockResolvedValue(makeUser());

        render(<RegisterPage />);

        await waitFor(() => {
            expect(navigationMocks.replace).toHaveBeenCalledWith("/dashboard");
        });
        expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    });

    it("redirects a logged-in verified user away from forgot password", async () => {
        window.history.pushState({}, "", "/forgot-password");
        vi.spyOn(api, "getMe").mockResolvedValue(makeUser());

        render(<ForgotPasswordPage />);

        await waitFor(() => {
            expect(navigationMocks.replace).toHaveBeenCalledWith("/dashboard");
        });
        expect(screen.queryByRole("button", { name: /send reset link/i })).not.toBeInTheDocument();
    });

    it("redirects a logged-in unverified user to verify email", async () => {
        window.history.pushState({}, "", "/login");
        vi.spyOn(api, "getMe").mockResolvedValue(makeUser({ emailVerified: false }));

        render(<LoginPage />);

        await waitFor(() => {
            expect(navigationMocks.replace).toHaveBeenCalledWith("/verify-email");
        });
    });

    it("allows logged-out users to see the login form", async () => {
        window.history.pushState({}, "", "/login");
        vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthorized"));

        render(<LoginPage />);

        expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
        expect(navigationMocks.replace).not.toHaveBeenCalled();
    });

    it("keeps reset password token links accessible for logged-in users", async () => {
        window.history.pushState({}, "", "/reset-password?token=reset-token");
        const getMeSpy = vi.spyOn(api, "getMe").mockResolvedValue(makeUser());

        render(<ResetPasswordPage />);

        expect(await screen.findByLabelText("New password")).toBeInTheDocument();
        expect(getMeSpy).not.toHaveBeenCalled();
        expect(navigationMocks.replace).not.toHaveBeenCalled();
    });

    it("redirects logged-in users away from reset password when token is missing", async () => {
        window.history.pushState({}, "", "/reset-password");
        vi.spyOn(api, "getMe").mockResolvedValue(makeUser());

        render(<ResetPasswordPage />);

        await waitFor(() => {
            expect(navigationMocks.replace).toHaveBeenCalledWith("/dashboard");
        });
        expect(screen.queryByText("Invalid or expired reset link.")).not.toBeInTheDocument();
    });
});
