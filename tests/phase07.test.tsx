import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCard } from "../src/components/apps/error-card";
import { ApiKeyManager } from "../src/components/settings/api-key-manager";
import { EmailVerificationCard } from "../src/components/settings/email-verification-card";
import { api, type User } from "../src/lib/api";

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

const unverifiedUser: User = {
    id: "user-1",
    email: "operator@example.com",
    name: "Operator One",
    preferences: { newDashboard: true },
    onboardingCompleted: true,
    emailVerified: false,
    createdAt: "2026-04-26T10:00:00.000Z",
    organizationId: "org-1",
    organizationName: "Acme",
    organizationSlug: "acme",
    orgRole: "OWNER",
    memberships: [],
};

describe("Phase 07 dashboard polish", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it("renders classified deploy errors with docs and retry action", () => {
        const onRetry = vi.fn();
        render(
            <ErrorCard
                classification={{
                    category: "HEALTH_CHECK_FAILED",
                    title: "Health check failed",
                    summary: "The container did not return healthy.",
                    suggestion: "Ensure /health returns HTTP 200.",
                    logSnippet: "candidate removed after failed healthcheck",
                    docsLink: "/docs/deployments/troubleshooting#health-check",
                }}
                onRetry={onRetry}
            />
        );

        expect(screen.getByTestId("deploy-error-card")).toBeInTheDocument();
        expect(screen.getByText("HEALTH_CHECK_FAILED")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /see docs/i })).toHaveAttribute(
            "href",
            "/docs/deployments/troubleshooting#health-check"
        );

        fireEvent.click(screen.getByRole("button", { name: /retry deploy/i }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("verifies an email code from the settings card", async () => {
        const onVerified = vi.fn(async () => undefined);
        vi.spyOn(api, "verifyEmail").mockResolvedValue({ success: true, emailVerified: true });

        renderWithQuery(<EmailVerificationCard user={unverifiedUser} onVerified={onVerified} />);
        fireEvent.change(screen.getByLabelText("6-digit code"), {
            target: { value: "123456" },
        });
        fireEvent.click(screen.getByTestId("verify-email-button"));

        await waitFor(() => {
            expect(api.verifyEmail).toHaveBeenCalledWith({ code: "123456" });
            expect(onVerified).toHaveBeenCalledTimes(1);
        });
    });

    it("shows active API key metadata without exposing stored hashes", async () => {
        vi.spyOn(api, "getApiKeys").mockResolvedValue({
            availableScopes: ["apps:read", "apps:write"],
            apiKeys: [{
                id: "key-1",
                name: "Deploy key",
                prefix: "opl_live",
                scopes: ["apps:write"],
                lastUsedAt: null,
                expiresAt: null,
                createdAt: "2026-04-26T10:00:00.000Z",
            }],
        });

        renderWithQuery(<ApiKeyManager />);

        expect(await screen.findByText("Deploy key")).toBeInTheDocument();
        expect(screen.getByText("opl_live...")).toBeInTheDocument();
        expect(screen.queryByText(/keyHash/i)).not.toBeInTheDocument();
    });

    it("creates an API key and shows the raw key only after creation", async () => {
        vi.spyOn(api, "getApiKeys").mockResolvedValue({
            availableScopes: ["apps:read", "apps.deploy:write"],
            apiKeys: [],
        });
        vi.spyOn(api, "createApiKey").mockResolvedValue({
            key: "opl_live_generatedSecret",
            apiKey: {
                id: "key-1",
                name: "GitHub Actions",
                prefix: "opl_live",
                scopes: ["apps.deploy:write"],
                lastUsedAt: null,
                expiresAt: null,
                createdAt: "2026-04-26T10:00:00.000Z",
            },
        });

        renderWithQuery(<ApiKeyManager />);

        expect(await screen.findByText("No API keys created yet.")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "GitHub Actions" },
        });
        fireEvent.click(screen.getByTestId("create-api-key-button"));

        await waitFor(() => {
            expect(api.createApiKey).toHaveBeenCalledWith({
                name: "GitHub Actions",
                scopes: ["apps:read", "apps.deploy:write"],
            });
        });
        const manager = screen.getByTestId("api-key-manager");
        expect(within(manager).getByText("opl_live_generatedSecret")).toBeInTheDocument();
    });
});
