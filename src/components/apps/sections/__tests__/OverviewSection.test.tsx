import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { OverviewSection } from "../OverviewSection";
import { api, ApiRequestError, type App, type AppDomainRecord, type AppDomainsResponse, type AppMetricHistory, type DeploymentRecord, type RequestLatencyResponse, type RequestSummaryResponse, type Server } from "@/lib/api";

// This file replaces a version that referenced UI text/classes (`bg-green-100`, "Agent live",
// "SSL Status") that no longer exist anywhere in the current component and never rendered a
// QueryClientProvider despite the component's real useQuery calls — it was failing before any
// of this session's changes, testing a stale prior shape of the component rather than current
// behavior. Rewritten to actually exercise the real-data + status-correctness fix.

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            ...actual.api,
            getAppMetricsHistory: vi.fn(),
            getRequestSummary: vi.fn(),
            getRequestLatency: vi.fn(),
            getAppDeployments: vi.fn(),
        },
    };
});

const app: App = {
    id: "app-1",
    name: "Checkout API",
    status: "running",
    healthStatus: "healthy",
    healthCheckedAt: new Date().toISOString(),
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    port: 3000,
    envVars: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    serverConnected: true,
    effectiveStatus: "running",
};

const server: Server = {
    id: "server-1",
    name: "Production VPS",
    ip: "10.0.0.10",
    publicIp: "13.201.44.55",
    status: "connected",
    isLiveConnected: true,
    createdAt: "2026-01-01T00:00:00.000Z",
};

function domain(overrides: Partial<AppDomainRecord> = {}): AppDomainRecord {
    return {
        id: "domain-1",
        domain: "checkout.example.com",
        type: "custom",
        status: "active",
        expectedIp: "13.201.44.55",
        resolvedIps: ["13.201.44.55"],
        lastCheckedAt: null,
        connectedAt: null,
        sslStatus: "active",
        primary: true,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        preferredUrl: "https://checkout.example.com",
        ...overrides,
    };
}

const domainData: AppDomainsResponse = {
    domains: [domain()],
    primaryDomain: "checkout.example.com",
    previewDomain: null,
};

const latestDeployment: DeploymentRecord = {
    id: "deployment-1",
    sha: "abcdef123456",
    status: "succeeded",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:03:00.000Z",
    triggeredBy: "manual",
    triggerMeta: {},
};

function metricsHistory(overrides: Partial<AppMetricHistory> = {}): AppMetricHistory {
    return {
        range: "7d",
        healthStatus: "healthy",
        healthChecks: { total: 100, healthy: 99, uptimePercent: 99 },
        series: { timestamps: [], cpu: [10, 12, 11], memoryPercent: [40, 41, 42], restartCount: [0, 0, 0] },
        ...overrides,
    };
}

function requestSummary(overrides: Partial<RequestSummaryResponse> = {}): RequestSummaryResponse {
    return {
        appId: "app-1",
        window: "7d",
        totalRequests: 24500,
        errorRequests: 61,
        errorRate: 0.25,
        successRate: 99.75,
        avgResponseMs: 118,
        bytesPerSecond: 83149,
        ...overrides,
    };
}

function requestLatency(): RequestLatencyResponse {
    return {
        appId: "app-1",
        window: "7d",
        series: [
            { bucket: "2026-01-01T00:00:00.000Z", p50: 100, p95: 200, p99: 300 },
            { bucket: "2026-01-01T01:00:00.000Z", p50: 120, p95: 220, p99: 320 },
        ],
    };
}

function renderOverview(overrides: Partial<ComponentProps<typeof OverviewSection>> = {}) {
    const props: ComponentProps<typeof OverviewSection> = {
        app,
        server,
        domainData,
        domainsLoading: false,
        latestDeployment,
        rollbackTarget: null,
        deployErrorClassification: null,
        deployErrorRaw: null,
        deleteFailureReason: null,
        deployPending: false,
        rollbackPending: false,
        deletePending: false,
        deleteLocked: false,
        onDeploy: vi.fn(),
        onViewLogs: vi.fn(),
        onRollback: vi.fn(),
        onRetryDeleteCleanup: vi.fn(),
        ...overrides,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return {
        props,
        ...render(
            <QueryClientProvider client={queryClient}>
                <OverviewSection {...props} />
            </QueryClientProvider>
        ),
    };
}

describe("OverviewSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getAppMetricsHistory).mockResolvedValue(metricsHistory());
        vi.mocked(api.getRequestSummary).mockResolvedValue(requestSummary());
        vi.mocked(api.getRequestLatency).mockResolvedValue(requestLatency());
        vi.mocked(api.getAppDeployments).mockResolvedValue([]);
    });

    it("shows real uptime/health-check data, not a hardcoded 99.99%", async () => {
        renderOverview();

        await waitFor(() => expect(screen.getByText("99.00%")).toBeVisible());
        expect(screen.getByText("99 OK / 100")).toBeVisible();
    });

    it("shows real request-analytics numbers instead of the old hardcoded 24.5k/81.2 KB/s/0.25%", async () => {
        renderOverview();

        await waitFor(() => expect(screen.getByText("118ms")).toBeVisible());
        expect(screen.getByText("99.8%")).toBeVisible();
        expect(screen.getByText("24.5K")).toBeVisible();
        expect(screen.getByText("0.25%")).toBeVisible();
    });

    it("shows an upgrade prompt instead of fake numbers when request analytics isn't entitled", async () => {
        vi.mocked(api.getRequestSummary).mockRejectedValue(new ApiRequestError(403, { message: "feature_not_available" }));
        renderOverview();

        await waitFor(() => expect(screen.getAllByText("Requires Pro plan").length).toBeGreaterThan(0));
    });

    it("never shows Running/Ready when the app's status says running but the server is offline", async () => {
        renderOverview({
            app: { ...app, status: "running", effectiveStatus: "offline", serverConnected: false },
        });

        await waitFor(() => expect(screen.getAllByText("Server Offline").length).toBeGreaterThan(0));
        expect(screen.queryByText("Ready")).not.toBeInTheDocument();
        // The live-preview card (screenshot thumbnail etc.) only renders when actually running.
        expect(screen.queryByRole("link", { name: /Visit Site/i })).not.toBeInTheDocument();
    });

    it("shows the app as running when status is running and the server is actually connected", async () => {
        renderOverview();

        await waitFor(() => expect(screen.getAllByText("Running").length).toBeGreaterThan(0));
    });

    it("falls back to computing offline status client-side when effectiveStatus is absent (e.g. a stale cached response)", async () => {
        renderOverview({
            app: { id: app.id, name: app.name, status: "running", createdAt: app.createdAt },
            server: { ...server, status: "disconnected", isLiveConnected: false },
        });

        await waitFor(() => expect(screen.getAllByText("Server Offline").length).toBeGreaterThan(0));
    });

    it("has a View Logs shortcut without fetching logs itself", async () => {
        const onViewLogs = vi.fn();
        const { fireEvent } = await import("@testing-library/react");
        renderOverview({ onViewLogs });

        fireEvent.click(screen.getByRole("button", { name: /View Logs/i }));
        expect(onViewLogs).toHaveBeenCalledTimes(1);
    });

    it("shows delete lifecycle state", () => {
        renderOverview({
            app: { ...app, status: "delete_failed", deployLogs: "cleanup failed" },
            deleteLocked: true,
            deleteFailureReason: "cleanup failed",
        });

        expect(screen.getByText("cleanup failed")).toBeVisible();
    });
});
