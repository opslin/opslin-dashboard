import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../src/app/(dashboard)/settings/page";
import { api, type PlanRecord, type User } from "../src/lib/api";

const routerMocks = vi.hoisted(() => ({
    push: vi.fn(),
}));

const authState = vi.hoisted(() => ({
    current: {
        user: null as User | null,
        refetch: vi.fn(async () => undefined),
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => routerMocks,
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

vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => authState.current,
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

const baseUser: User = {
    id: "user-1",
    email: "operator@example.com",
    name: "Operator One",
    preferences: { newDashboard: true },
    onboardingCompleted: true,
    emailVerified: true,
    createdAt: "2026-05-11T00:00:00.000Z",
    organizationId: "org-1",
    organizationName: "Acme Ops",
    organizationSlug: "acme-ops",
    orgRole: "OWNER",
    memberships: [],
};

const basePlan: PlanRecord = {
    id: "plan-1",
    slug: "starter",
    name: "Starter",
    priceMonthly: 999,
    gstPercent: 18,
    priceWithGst: 1178,
    currency: "INR",
    maxServers: 3,
    maxApps: 10,
    maxDatabases: 3,
    features: {},
    isPublic: true,
    sortOrder: 1,
};

function mockSettingsQueries() {
    vi.spyOn(api, "getCurrentPlan").mockResolvedValue({
        plan: basePlan,
        pendingPlan: null,
        subscription: {
            id: "sub-1",
            status: "active",
            paymentRequired: false,
            trialStart: null,
            trialEnd: null,
            currentPeriodEnd: null,
            cancelledAt: null,
        },
        usage: {
            servers: 1,
            apps: 2,
            databases: 1,
        },
        trial: null,
    });
    vi.spyOn(api, "getPlanUsage").mockResolvedValue({
        usage: {
            servers: 1,
            apps: 2,
            databases: 1,
        },
        limits: {
            servers: 3,
            apps: 10,
            databases: 3,
        },
        plan: basePlan,
    });
    vi.spyOn(api, "getApiKeys").mockResolvedValue({
        availableScopes: ["apps:read", "apps.deploy:write"],
        apiKeys: [],
    });
    vi.spyOn(api, "getSessions").mockResolvedValue([
        {
            id: "session-1",
            device: "Chrome on macOS",
            ip: "127.0.0.1",
            lastActive: "2026-05-11T00:00:00.000Z",
            createdAt: "2026-05-10T00:00:00.000Z",
            isCurrent: true,
        },
    ]);
}

describe("SettingsPage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
        authState.current = {
            user: baseUser,
            refetch: vi.fn(async () => undefined),
        };
        mockSettingsQueries();
    });

    it("renders every settings section after the premium layout polish", async () => {
        renderWithQuery(<SettingsPage />);

        expect(screen.getByText("Profile")).toBeInTheDocument();
        expect(screen.getByTestId("email-verification-card")).toBeInTheDocument();
        expect(await screen.findByTestId("plan-settings")).toBeInTheDocument();
        expect(await screen.findByTestId("api-key-manager")).toBeInTheDocument();
        expect(await screen.findByTestId("session-manager")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Toggle Dashboard v2" })).toBeInTheDocument();
        expect(screen.getByTestId("change-password-button")).toBeInTheDocument();
        expect(screen.getByText("Adding Servers")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /open servers/i })).toHaveAttribute("href", "/servers");
    });

    it("keeps the dashboard preference switch wired to the existing API payload", async () => {
        const updatePreferencesSpy = vi.spyOn(api, "updatePreferences").mockResolvedValue({
            ...baseUser,
            preferences: { newDashboard: false },
        });

        renderWithQuery(<SettingsPage />);
        fireEvent.click(screen.getByRole("switch", { name: "Toggle Dashboard v2" }));

        await waitFor(() => {
            expect(updatePreferencesSpy).toHaveBeenCalledWith({ newDashboard: false });
            expect(authState.current.refetch).toHaveBeenCalledTimes(1);
        });
    });
});
