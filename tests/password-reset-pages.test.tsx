import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "../src/app/forgot-password/page";
import ResetPasswordPage from "../src/app/reset-password/page";
import LoginPage from "../src/app/(auth)/login/page";
import { api } from "../src/lib/api";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: pushMock,
        replace: replaceMock,
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

describe("forgot password page", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        pushMock.mockReset();
        replaceMock.mockReset();
        vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthorized"));
        window.history.pushState({}, "", "/forgot-password");
    });

    it("renders the forgot password form", async () => {
        render(<ForgotPasswordPage />);

        expect(await screen.findByRole("heading", { name: "Forgot password?" })).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute("href", "/login");
    });

    it("validates email before submitting", async () => {
        render(<ForgotPasswordPage />);

        fireEvent.change(await screen.findByLabelText("Email"), {
            target: { value: "not-an-email" },
        });
        fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);

        expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    });

    it("shows the generic success message after submit", async () => {
        vi.spyOn(api, "forgotPassword").mockResolvedValue({
            success: true,
            message: "If this email exists, a password reset link has been sent.",
        });

        render(<ForgotPasswordPage />);
        fireEvent.change(await screen.findByLabelText("Email"), {
            target: { value: "User@Example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

        await waitFor(() => {
            expect(api.forgotPassword).toHaveBeenCalledWith({ email: "user@example.com" });
        });
        expect(screen.getByText("Check your email")).toBeInTheDocument();
        expect(screen.getByText("If this email exists, a password reset link has been sent.")).toBeInTheDocument();
    });
});

describe("reset password page", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        pushMock.mockReset();
        replaceMock.mockReset();
        vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthorized"));
    });

    it("shows an invalid link message when token is missing", async () => {
        window.history.pushState({}, "", "/reset-password");

        render(<ResetPasswordPage />);

        expect(await screen.findByText("Invalid or expired reset link.")).toBeInTheDocument();
    });

    it("validates password length", async () => {
        window.history.pushState({}, "", "/reset-password?token=reset-token");

        render(<ResetPasswordPage />);
        expect(await screen.findByLabelText("New password")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New password"), {
            target: { value: "short" },
        });
        fireEvent.change(screen.getByLabelText("Confirm password"), {
            target: { value: "short" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    });

    it("validates password confirmation", async () => {
        window.history.pushState({}, "", "/reset-password?token=reset-token");

        render(<ResetPasswordPage />);
        expect(await screen.findByLabelText("New password")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New password"), {
            target: { value: "NewPassword123!" },
        });
        fireEvent.change(screen.getByLabelText("Confirm password"), {
            target: { value: "DifferentPassword123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    });

    it("shows success and a login link after reset", async () => {
        window.history.pushState({}, "", "/reset-password?token=reset-token");
        vi.spyOn(api, "resetPassword").mockResolvedValue({
            success: true,
            message: "Password reset successfully. Please log in with your new password.",
        });

        render(<ResetPasswordPage />);
        expect(await screen.findByLabelText("New password")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New password"), {
            target: { value: "NewPassword123!" },
        });
        fireEvent.change(screen.getByLabelText("Confirm password"), {
            target: { value: "NewPassword123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        await waitFor(() => {
            expect(api.resetPassword).toHaveBeenCalledWith({
                token: "reset-token",
                newPassword: "NewPassword123!",
            });
        });
        expect(screen.getByText("Password reset successfully. You can now log in with your new password.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute("href", "/login");
    });
});

describe("login forgot password link", () => {
    beforeEach(() => {
        pushMock.mockReset();
        replaceMock.mockReset();
        vi.spyOn(api, "getMe").mockRejectedValue(new Error("Unauthorized"));
        window.history.pushState({}, "", "/login");
    });

    it("links to forgot password from login", async () => {
        render(<LoginPage />);

        expect(await screen.findByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    });
});
