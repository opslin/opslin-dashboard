import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeploymentsSection } from "../DeploymentsSection";
import type { ComponentProps, ReactNode } from "react";
import type { App, DeployGateSummary, DeploymentRecord, Server } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/components/DeployModeSelector", () => ({
    DeployModeSelector: () => <div data-testid="deploy-mode-selector">Deploy mode selector</div>,
}));

vi.mock("@/components/SafeDeploySetupWizard", () => ({
    SafeDeploySetupWizard: () => <div data-testid="safe-deploy-setup">Safe deploy setup</div>,
}));

vi.mock("@/components/DeploymentCheckReportCard", () => ({
    DeploymentCheckReportCard: ({ report }: { report: unknown }) => (
        report ? <div data-testid="deployment-check-report">Deployment check report</div> : null
    ),
}));

vi.mock("@/components/PlanGate", () => ({
    PlanGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/UpgradePrompt", () => ({
    UpgradePrompt: () => <div data-testid="upgrade-prompt">Upgrade</div>,
}));

vi.mock("@/components/deploy/live/deploy-live-view", () => ({
    DeployLiveView: () => <div data-testid="deploy-live-view">Deploy live view</div>,
}));

const app: App = {
    id: "app-1",
    name: "Checkout API",
    status: "running",
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    port: 3000,
    envVars: {},
    createdAt: "2026-01-01T00:00:00.000Z",
};

const server: Pick<Server, "id" | "name" | "status" | "isLiveConnected"> = {
    id: "server-1",
    name: "prod-1",
    status: "connected",
    isLiveConnected: true,
};

const deployments: DeploymentRecord[] = [
    {
        id: "deployment-current",
        sha: "aaaaaaaaaaaa",
        status: "succeeded",
        startedAt: "2026-01-02T00:00:00.000Z",
        finishedAt: "2026-01-02T00:03:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
    },
    {
        id: "deployment-rollback",
        sha: "bbbbbbbbbbbb",
        status: "succeeded",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:03:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
    },
    {
        id: "deployment-failed",
        sha: "cccccccccccc",
        status: "failed",
        startedAt: "2025-12-31T00:00:00.000Z",
        finishedAt: "2025-12-31T00:03:00.000Z",
        triggeredBy: "manual",
        triggerMeta: {},
        healthLog: "npm install failed",
    },
];

const activeDeployGate: DeployGateSummary = {
    id: "gate-1",
    appId: "app-1",
    organizationId: "org-1",
    provider: "github",
    repoFullName: "acme/checkout",
    branch: "main",
    mode: "safe",
    testRunner: "github_actions",
    tokenLastUsedAt: null,
    enabled: true,
    secretsInjected: true,
    createdById: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderDeployments(overrides: Partial<ComponentProps<typeof DeploymentsSection>> = {}) {
    const props: ComponentProps<typeof DeploymentsSection> = {
        app,
        server,
        appId: app.id,
        deployments,
        activeDeployGate: null,
        deployGatesLoading: false,
        currentDeployMode: "safe",
        repoFullName: "acme/checkout",
        latestDeployment: deployments[0],
        latestCheckReport: null,
        deployErrorClassification: null,
        deployErrorRaw: null,
        liveStatus: "connected",
        liveLastEventAt: "2026-01-02T00:03:00.000Z",
        pollingFallback: false,
        appUrl: "https://checkout.example.com",
        deployPending: false,
        rollbackPending: false,
        deleteLocked: false,
        onDeploy: vi.fn(),
        onViewLogs: vi.fn(),
        onRollback: vi.fn(),
        onSetupComplete: vi.fn(),
        ...overrides,
    };

    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    return {
        props,
        ...render(
            <QueryClientProvider client={queryClient}>
                <DeploymentsSection {...props} />
            </QueryClientProvider>
        ),
    };
}

describe("DeploymentsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lists deployments with the current one marked and a rollback on older successes", () => {
        const onRollback = vi.fn();
        renderDeployments({ onRollback });

        expect(screen.getByRole("heading", { name: "Deployments" })).toBeVisible();
        expect(screen.getByText("Current")).toBeVisible();
        expect(screen.getByText("aaaaaaa")).toBeVisible();
        expect(screen.getByText("bbbbbbb")).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: /Roll back/i }));
        expect(onRollback).toHaveBeenCalledWith("bbbbbbbbbbbb");
    });

    it("keeps Deploy mode collapsed until opened", () => {
        renderDeployments();

        expect(screen.queryByTestId("deploy-mode-selector")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Deploy mode/i }));
        expect(screen.getByTestId("deploy-mode-selector")).toBeVisible();
    });

    it("opens the details drawer with build logs from a row", () => {
        renderDeployments();

        fireEvent.click(screen.getByRole("button", { name: /Open details for Deploy ccccccc/i }));
        expect(screen.getByText("Deployment details")).toBeVisible();
        expect(screen.getByText("npm install failed")).toBeVisible();
    });

    it("shows the failure card with plain guidance for the latest failed deploy", () => {
        const failedDeploy: DeploymentRecord = {
            ...deployments[2],
            id: "deployment-failed-latest",
            startedAt: "2026-01-03T00:00:00.000Z",
            errorClassification: {
                category: "build_failed",
                title: "Build failed",
                summary: "Install step failed",
                suggestion: "Check package manager output.",
            },
        };
        renderDeployments({
            app: { ...app, status: "running" },
            deployments: [failedDeploy, deployments[0]],
            latestDeployment: failedDeploy,
            deployErrorClassification: failedDeploy.errorClassification,
            deployErrorRaw: "npm install failed",
        });

        expect(screen.getByTestId("deploy-error-card")).toBeVisible();
        expect(screen.getByText("The last deploy did not work")).toBeVisible();
        expect(screen.getByText("Install step failed")).toBeVisible();
        expect(screen.getByText("Your previous version is still live")).toBeVisible();
    });

    it("does not mark a skipped lock-busy attempt as failed or current", () => {
        const skipped: DeploymentRecord = {
            ...deployments[2],
            id: "deployment-skipped",
            startedAt: "2026-01-03T00:00:00.000Z",
            healthLog: "Another deployment is already running",
        };
        renderDeployments({ deployments: [skipped, deployments[0]], latestDeployment: deployments[0] });

        expect(screen.getByText("Skipped")).toBeVisible();
        expect(screen.queryByTestId("deploy-error-card")).not.toBeInTheDocument();
        expect(screen.getAllByText("Current")).toHaveLength(1);
    });

    it("renders server-queued deployments as waiting, not failed", () => {
        const queued: DeploymentRecord = {
            ...deployments[0],
            id: "deployment-queued",
            status: "pending",
            finishedAt: undefined,
            queue: { jobId: "job-1", state: "waiting", progress: { stage: "queued" } },
        };
        renderDeployments({ deployments: [queued], latestDeployment: queued });

        expect(screen.getByText("Waiting for server")).toBeVisible();
        expect(screen.queryByText("Failed")).not.toBeInTheDocument();
    });

    it("surfaces a failed Safe Deploy CI run while keeping the old release current", () => {
        renderDeployments({
            activeDeployGate: {
                ...activeDeployGate,
                lastCiRun: {
                    id: "ci-1",
                    deployGateId: "gate-1",
                    deploymentId: null,
                    provider: "github",
                    repoFullName: "acme/checkout",
                    branch: "main",
                    status: "failed",
                    commitSha: "dddddddddddd",
                    runId: "123",
                    runUrl: "https://github.com/acme/checkout/actions/runs/123",
                    failureReason: "GitHub Actions concluded with failure",
                    createdAt: "2026-01-03T00:00:00.000Z",
                    startedAt: "2026-01-03T00:00:00.000Z",
                    finishedAt: "2026-01-03T00:02:00.000Z",
                },
                lastDeployment: deployments[0],
                lastDeploymentStatus: "succeeded",
            },
            deployments: [deployments[0], deployments[1]],
            latestDeployment: deployments[0],
        });

        expect(screen.getByText("Tests failed, deploy skipped")).toBeVisible();
        expect(screen.getByText("CI FAILED")).toBeVisible();
        expect(screen.getByRole("link", { name: /GitHub run/i })).toHaveAttribute("href", "https://github.com/acme/checkout/actions/runs/123");
        expect(screen.getByText("Current")).toBeVisible();
    });

    it("shows the live view only while a deployment is in flight", () => {
        const running: DeploymentRecord = { ...deployments[0], id: "deployment-running", status: "running", finishedAt: undefined };
        renderDeployments({ deployments: [running], latestDeployment: running });

        expect(screen.getByTestId("deploy-live-view")).toBeVisible();
    });
});
