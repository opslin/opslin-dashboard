import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppDetailPage from "../page";
import { api } from "@/lib/api";
import type { App, AppDomainRecord, DeploymentRecord, Server } from "@/lib/api";

const navigationMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "app-1" }),
    useRouter: () => navigationMocks,
    useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock("@/components/apps/app-domain-setup-card", () => ({
    AppDomainSetupCard: () => <div data-testid="domain-setup-card">Domain setup</div>,
}));

vi.mock("@/components/DeployModeSelector", () => ({
    DeployModeSelector: () => <div data-testid="deploy-mode-selector">Deploy mode selector</div>,
}));

vi.mock("@/components/SafeDeploySetupWizard", () => ({
    SafeDeploySetupWizard: () => <div data-testid="safe-deploy-setup">Safe deploy setup</div>,
}));

vi.mock("@/components/DeploymentCheckReportCard", () => ({
    DeploymentCheckReportCard: () => <div data-testid="deployment-check-report">Deployment check report</div>,
}));

vi.mock("@/components/apps/app-live-monitor", () => ({
    AppLiveMonitor: () => <div data-testid="app-live-monitor">Live monitor</div>,
}));

vi.mock("@/components/apps/app-observability-panel", () => ({
    AppObservabilityPanel: () => <div data-testid="app-observability-panel">Observability</div>,
}));

vi.mock("@/components/logs/enhanced-log-viewer", () => ({
    EnhancedLogViewer: () => <div data-testid="enhanced-log-viewer">Logs</div>,
}));

vi.mock("@/components/ui/env-vars-editor", () => ({
    EnvVarsEditor: () => <div data-testid="env-vars-editor">Env vars</div>,
}));

vi.mock("@/components/PlanGate", () => ({
    PlanGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/UpgradePrompt", () => ({
    UpgradePrompt: () => <div data-testid="upgrade-prompt">Upgrade</div>,
}));

vi.mock("@/components/apps/domains/PreviewDomainCard", () => ({
    PreviewDomainCard: () => <div data-testid="preview-domain-card">Preview Domain Card</div>,
}));

vi.mock("@/components/apps/domains/CustomDomainsTable", () => ({
    CustomDomainsTable: () => <div data-testid="custom-domains-table">Custom Domains Table</div>,
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            getServers: vi.fn(),
            getApps: vi.fn(),
            getAppDomains: vi.fn(),
            getAppLogs: vi.fn(),
            getAppDeployments: vi.fn(),
            getDeployGates: vi.fn(),
            deleteApp: vi.fn(),
            stopApp: vi.fn(),
            deployApp: vi.fn(),
            rollbackApp: vi.fn(),
            updateAppEnvVars: vi.fn(),
            updateApp: vi.fn(),
            updateServerPublicAccess: vi.fn(),
            testRegistryCredentials: vi.fn(),
        },
    };
});

const server: Server = {
    id: "server-1",
    name: "Production VPS",
    ip: "10.0.0.10",
    publicIp: "13.201.44.55",
    status: "connected",
    createdAt: "2026-01-01T00:00:00.000Z",
};

const app: App = {
    id: "app-1",
    name: "Smoke App",
    status: "running",
    domain: "smoke.example.com",
    gitUrl: "https://github.com/acme/smoke.git",
    branch: "main",
    port: 3000,
    envVars: {},
    publicStatus: false,
    createdAt: "2026-01-01T00:00:00.000Z",
};

const primaryDomain: AppDomainRecord = {
    id: "domain-1",
    domain: "smoke.example.com",
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
    preferredUrl: "https://smoke.example.com",
};

const deploymentHistory: DeploymentRecord[] = [
    {
        id: "deployment-current",
        sha: "current123456",
        status: "succeeded",
        startedAt: "2026-01-02T00:00:00.000Z",
        finishedAt: "2026-01-02T00:03:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
    },
    {
        id: "deployment-previous",
        sha: "previous123456",
        status: "succeeded",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:03:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
    },
];

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <AppDetailPage />
        </QueryClientProvider>
    );
}

describe("AppDetailPage extraction smoke", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams();
        vi.mocked(api.getServers).mockResolvedValue([server]);
        vi.mocked(api.getApps).mockResolvedValue([app]);
        vi.mocked(api.getAppDomains).mockResolvedValue({
            domains: [primaryDomain],
            primaryDomain: "smoke.example.com",
            previewDomain: null,
        });
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Smoke App",
            logs: "",
            status: "running",
        });
        vi.mocked(api.getAppDeployments).mockResolvedValue([]);
        vi.mocked(api.getDeployGates).mockResolvedValue([]);
    });

    it("renders the extracted header, primary URL card, and seven-section shell", async () => {
        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(screen.getByText("Deployed on Production VPS")).toBeVisible();
        expect(screen.getByRole("link", { name: /Back to Apps/i })).toHaveAttribute("href", "/apps");
        expect(await screen.findByRole("link", { name: "https://smoke.example.com" })).toBeVisible();

        for (const section of ["Overview", "Deployments", "Domains", "Environment", "Logs", "Metrics", "Settings"]) {
            expect(screen.getByRole("tab", { name: section })).toBeVisible();
        }
        expect(screen.getByText("Quick Actions")).toBeVisible();
        expect(screen.queryByTestId("domain-setup-card")).not.toBeInTheDocument();
        expect(screen.queryByTestId("custom-domains-table")).not.toBeInTheDocument();
        expect(screen.queryByTestId("app-live-monitor")).not.toBeInTheDocument();
        expect(api.getAppLogs).not.toHaveBeenCalled();
    });

    it("writes selected sections to the URL", async () => {
        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Domains" }), { button: 0 });

        expect(navigationMocks.replace).toHaveBeenCalledWith("/apps/app-1?section=domains", { scroll: false });
    });

    it("preserves the selected section from the URL on refresh", async () => {
        navigationMocks.searchParams = new URLSearchParams("section=environment");

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(await screen.findByTestId("env-vars-editor")).toBeVisible();
        expect(screen.queryByTestId("domain-setup-card")).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Environment" })).toHaveAttribute("aria-selected", "true");
    });

    it("renders the Domains section content on demand", async () => {
        navigationMocks.searchParams = new URLSearchParams("section=domains");

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(await screen.findByTestId("domain-setup-card")).toBeVisible();
        expect(await screen.findByTestId("preview-domain-card")).toBeVisible();
        expect(await screen.findByTestId("custom-domains-table")).toBeVisible();
    });

    it("renders the Deployments section and keeps rollback confirmation wired", async () => {
        navigationMocks.searchParams = new URLSearchParams("section=deployments");
        vi.mocked(api.getAppDeployments).mockResolvedValue(deploymentHistory);

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(screen.getByText("Deployment History")).toBeVisible();

        // Deployment history rows render once the deployments query resolves; wait for the
        // per-row rollback button (not just the static "Actions" card one) before clicking, or
        // this races the query and clicks a still-disabled button.
        await waitFor(() => {
            expect(screen.getAllByRole("button", { name: /Rollback/i }).length).toBeGreaterThan(1);
        });
        fireEvent.click(screen.getAllByRole("button", { name: /Rollback/i })[0]);

        expect(await screen.findByText("Roll back to version previous123456?")).toBeVisible();
    });

    it("does not fetch app logs until the Logs section is active", async () => {
        const overview = renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(api.getAppLogs).not.toHaveBeenCalled();
        overview.unmount();

        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams("section=logs");
        vi.mocked(api.getServers).mockResolvedValue([server]);
        vi.mocked(api.getApps).mockResolvedValue([app]);
        vi.mocked(api.getAppDomains).mockResolvedValue({
            domains: [primaryDomain],
            primaryDomain: "smoke.example.com",
            previewDomain: null,
        });
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Smoke App",
            logs: "deploy log",
            status: "running",
        });
        vi.mocked(api.getAppDeployments).mockResolvedValue([]);
        vi.mocked(api.getDeployGates).mockResolvedValue([]);

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        await waitFor(() => expect(api.getAppLogs).toHaveBeenCalledTimes(1));
        expect(await screen.findByTestId("enhanced-log-viewer")).toBeVisible();
    });

    it("does not render metrics components until the Metrics section is active", async () => {
        const overview = renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(screen.queryByTestId("app-live-monitor")).not.toBeInTheDocument();
        expect(screen.queryByTestId("app-observability-panel")).not.toBeInTheDocument();
        overview.unmount();

        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams("section=metrics");
        vi.mocked(api.getServers).mockResolvedValue([server]);
        vi.mocked(api.getApps).mockResolvedValue([app]);
        vi.mocked(api.getAppDomains).mockResolvedValue({
            domains: [primaryDomain],
            primaryDomain: "smoke.example.com",
            previewDomain: null,
        });
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Smoke App",
            logs: "",
            status: "running",
        });
        vi.mocked(api.getAppDeployments).mockResolvedValue([]);
        vi.mocked(api.getDeployGates).mockResolvedValue([]);

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(await screen.findByTestId("app-live-monitor")).toBeVisible();
        expect(await screen.findByTestId("app-observability-panel")).toBeVisible();
        expect(api.getAppLogs).not.toHaveBeenCalled();
    });

    it("renders the Settings section content on demand", async () => {
        navigationMocks.searchParams = new URLSearchParams("section=settings");

        renderPage();

        expect(await screen.findByRole("heading", { name: "Smoke App" })).toBeVisible();
        expect(screen.getByText("App Info")).toBeVisible();
        expect(screen.getByText("Build Configuration")).toBeVisible();
        expect(screen.getByText("Public Status Page")).toBeVisible();
        expect(screen.getByText("Danger Zone")).toBeVisible();
        expect(screen.getByRole("button", { name: /Save Build Config/i })).toBeVisible();
        expect(api.getAppLogs).not.toHaveBeenCalled();
    });
});
