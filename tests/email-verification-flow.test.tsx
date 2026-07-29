import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailForm } from "../src/components/auth/verify-email-form";
import { api, type User } from "../src/lib/api";
import LoginPage from "../src/app/(auth)/login/page";
import RegisterPage from "../src/app/(auth)/register/page";
import DashboardLayout from "../src/app/(dashboard)/layout";
import VerifyEmailPage from "../src/app/verify-email/page";

const navigationMocks = vi.hoisted(() => ({
    pathname: "/apps",
    push: vi.fn(),
    replace: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
    login: vi.fn(),
    register: vi.fn(),
}));

const authHookState = vi.hoisted(() => ({
    current: {
        user: null as User | null,
        loading: false,
        isAuthenticated: false,
        logout: vi.fn(async () => undefined),
        refetch: vi.fn(async () => undefined),
    },
}));

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMocks.pathname,
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

vi.mock("@/lib/auth", () => ({
    login: authMocks.login,
    register: authMocks.register,
}));

vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => authHookState.current,
}));

vi.mock("@/components/layout/dashboard-shell", () => ({
    DashboardShell: ({ children }: { children: ReactNode }) => (
        <div data-testid="dashboard-shell">{children}</div>
    ),
}));

vi.mock("@/components/layout/legacy-dashboard-shell", () => ({
    LegacyDashboardShell: ({ children }: { children: ReactNode }) => (
        <div data-testid="legacy-dashboard-shell">{children}</div>
    ),
}));

vi.mock("@/components/onboarding/onboarding-wizard", () => ({
    OnboardingWizard: () => <div data-testid="onboarding-wizard" />,
}));

vi.mock("@/components/pricing/trial-badge", () => ({
    TrialBadge: () => <div data-testid="trial-badge" />,
}));

vi.mock("@/components/pricing/trial-banner", () => ({
    TrialBanner: () => <div data-testid="trial-banner" />,
}));

function renderWithQuery(ui: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: "user-1",
        email: "operator@example.com",
        name: "Operator",
        preferences: { newDashboard: true },
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: "2026-05-11T00:00:00.000Z",
        organizationId: "org-1",
        organizationName: "Ops",
        organizationSlug: "ops",
        orgRole: "OWNER",
        memberships: [],
        ...overrides,
    };
}

describe("VerifyEmailForm", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        navigationMocks.pathname = "/apps";
        authHookState.current = {
            user: null,
            loading: false,
            isAuthenticated: false,
            logout: vi.fn(async () => undefined),
            refetch: vi.fn(async () => undefined),
        };
        window.history.pushState({}, "", "/");
    });

    it("accepts only digits and disables verify until 6 digits", () => {
        renderWithQuery(<VerifyEmailForm onVerified={vi.fn()} />);

        const input = screen.getByLabelText("6-digit code") as HTMLInputElement;
        const verifyButton = screen.getByRole("button", { name: /verify email/i });

        expect(verifyButton).toBeDisabled();
        fireEvent.change(input, { target: { value: "12a 34" } });
        expect(input.value).toBe("1234");
        expect(verifyButton).toBeDisabled();

        fireEvent.change(input, { target: { value: "12a 34567" } });
        expect(input.value).toBe("123456");
        expect(verifyButton).toBeEnabled();
    });

    it("verifies a valid code and calls the success handler", async () => {
        const onVerified = vi.fn(async () => undefined);
        vi.spyOn(api, "verifyEmail").mockResolvedValue({ success: true, emailVerified: true });

        renderWithQuery(<VerifyEmailForm onVerified={onVerified} />);
        fireEvent.change(screen.getByLabelText("6-digit code"), {
            target: { value: "123456" },
        });
        fireEvent.click(screen.getByRole("button", { name: /verify email/i }));

        await waitFor(() => {
            expect(api.verifyEmail).toHaveBeenCalledWith({ code: "123456" });
            expect(onVerified).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByText("Email verified successfully.")).toBeInTheDocument();
    });

    it("shows the required error copy for an invalid code", async () => {
        vi.spyOn(api, "verifyEmail").mockRejectedValue(new Error("Bad code"));

        renderWithQuery(<VerifyEmailForm onVerified={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("6-digit code"), {
            target: { value: "000000" },
        });
        fireEvent.click(screen.getByRole("button", { name: /verify email/i }));

        expect(await screen.findByText("Invalid or expired verification code.")).toBeInTheDocument();
    });

    it("resends the verification code and exposes logout when requested", async () => {
        const onLogout = vi.fn(async () => undefined);
        vi.spyOn(api, "resendVerification").mockResolvedValue({
            success: true,
            message: "Sent",
            emailVerified: false,
        });

        renderWithQuery(
            <VerifyEmailForm
                showLogout
                onLogout={onLogout}
                onVerified={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /resend code/i }));
        expect(await screen.findByText("Verification code sent.")).toBeInTheDocument();
        expect(api.resendVerification).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: /logout/i }));
        expect(onLogout).toHaveBeenCalledTimes(1);
    });
});

describe("VerifyEmailPage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        authHookState.current = {
            user: makeUser({ emailVerified: false }),
            loading: false,
            isAuthenticated: true,
            logout: vi.fn(async () => undefined),
            refetch: vi.fn(async () => undefined),
        };
    });

    it("renders the verify email page for an unverified user", () => {
        renderWithQuery(<VerifyEmailPage />);

        expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
        expect(screen.getByText("We sent a 6-digit code to your email.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    });
});

describe("auth redirect flow", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        navigationMocks.pathname = "/apps";
        authHookState.current = {
            user: null,
            loading: false,
            isAuthenticated: false,
            logout: vi.fn(async () => undefined),
            refetch: vi.fn(async () => undefined),
        };
        window.history.pushState({}, "", "/");
    });

    it("redirects unverified login users to /verify-email and preserves next target", async () => {
        window.history.pushState({}, "", "/login?next=/apps/new");
        authMocks.login.mockResolvedValue({
            token: "ignored",
            user: makeUser({ emailVerified: false }),
        });

        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "operator@example.com" },
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "Password123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith("/verify-email");
        });
        expect(sessionStorage.getItem("opslin.postVerifyRedirect")).toBe("/apps/new");
    });

    it("sends verified login users to their remembered target", async () => {
        window.history.pushState({}, "", "/login?next=/apps/new");
        authMocks.login.mockResolvedValue({
            token: "ignored",
            user: makeUser({ emailVerified: true }),
        });

        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "operator@example.com" },
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "Password123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith("/apps/new");
        });
    });

    it("redirects unverified register users to /verify-email", async () => {
        authMocks.register.mockResolvedValue({
            token: "ignored",
            user: makeUser({ emailVerified: false }),
        });

        render(<RegisterPage />);
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Operator" },
        });
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "operator@example.com" },
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "Password123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith("/verify-email");
        });
    });

    it("sends verified register users to the dashboard", async () => {
        authMocks.register.mockResolvedValue({
            token: "ignored",
            user: makeUser({ emailVerified: true }),
        });

        render(<RegisterPage />);
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Operator" },
        });
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "operator@example.com" },
        });
        fireEvent.change(screen.getByLabelText("Password"), {
            target: { value: "Password123!" },
        });
        fireEvent.click(screen.getByRole("button", { name: /create account/i }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith("/dashboard");
        });
    });
});

describe("dashboard email verification guard", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        navigationMocks.pathname = "/apps";
        authHookState.current = {
            user: makeUser(),
            loading: false,
            isAuthenticated: true,
            logout: vi.fn(async () => undefined),
            refetch: vi.fn(async () => undefined),
        };
        vi.spyOn(api, "getServers").mockResolvedValue([]);
        vi.spyOn(api, "getCurrentPlan").mockResolvedValue(null);
    });

    it("redirects unverified dashboard users to /verify-email before product pages", async () => {
        authHookState.current.user = makeUser({ emailVerified: false });
        authHookState.current.isAuthenticated = true;

        renderWithQuery(
            <DashboardLayout>
                <div>Apps page</div>
            </DashboardLayout>
        );

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith("/verify-email");
        });
        expect(sessionStorage.getItem("opslin.postVerifyRedirect")).toBe("/apps");
        expect(screen.queryByText("Apps page")).not.toBeInTheDocument();
    });

    it("keeps settings accessible for unverified users", async () => {
        navigationMocks.pathname = "/settings";
        authHookState.current.user = makeUser({ emailVerified: false });
        authHookState.current.isAuthenticated = true;

        renderWithQuery(
            <DashboardLayout>
                <div>Settings page</div>
            </DashboardLayout>
        );

        expect(await screen.findByText("Settings page")).toBeInTheDocument();
        expect(navigationMocks.push).not.toHaveBeenCalledWith("/verify-email");
    });

    it("still shows onboarding after email verification when no server exists", async () => {
        navigationMocks.pathname = "/apps";
        authHookState.current.user = makeUser({
            emailVerified: true,
            onboardingCompleted: false,
        });
        authHookState.current.isAuthenticated = true;

        renderWithQuery(
            <DashboardLayout>
                <div>Apps page</div>
            </DashboardLayout>
        );

        expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
        expect(navigationMocks.push).not.toHaveBeenCalledWith("/verify-email");
    });
});
