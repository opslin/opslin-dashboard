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

vi.mock("@/components/DeploymentTimeline", () => ({
    DeploymentTimeline: () => <div data-testid="deployment-timeline">Deployment timeline</div>,
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

    it("renders deployment controls, timeline, and history status badges", () => {
        renderDeployments();

        expect(screen.getByTestId("deploy-mode-selector")).toBeVisible();
        expect(screen.getByTestId("deployment-command-center")).toBeVisible();
        expect(screen.getByTestId("deployment-timeline")).toBeVisible();
        expect(screen.getByText("Deployment History")).toBeVisible();
        expect(screen.getAllByText("aaaaaaa").length).toBeGreaterThan(0);
        expect(screen.getAllByText("SUCCEEDED").length).toBeGreaterThan(0);
        expect(screen.getByText("FAILED")).toBeVisible();
    });

    it("keeps rollback confirmation page-owned by surfacing the selected sha", () => {
        const onRollback = vi.fn();
        renderDeployments({ onRollback });

        fireEvent.click(screen.getAllByRole("button", { name: /Rollback/i })[0]);

        expect(onRollback).toHaveBeenCalledWith("bbbbbbbbbbbb");
    });

    it("shows classified failure guidance instead of only raw logs", () => {
        const failedDeploy: DeploymentRecord = {
            ...deployments[2],
            id: "deployment-failed-latest",
            startedAt: "2026-01-03T00:00:00.000Z",
            errorClassification: {
                category: "build_failed",
                title: "Build failed",
                summary: "Install step failed",
                suggestion: "Check package manager output.",
                logSnippet: "npm install failed",
                docsLink: "https://docs.example.com/builds",
            },
        };
        renderDeployments({
            app: { ...app, status: "error" },
            deployments: [failedDeploy],
            latestDeployment: failedDeploy,
            deployErrorClassification: failedDeploy.errorClassification,
            deployErrorRaw: "npm install failed",
        });

        expect(screen.getByText("Build failed")).toBeVisible();
        expect(screen.getAllByText("Install step failed").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Check package manager output.").length).toBeGreaterThanOrEqual(1);
    });

    it("health failure shows classification title", () => {
        const failedDeploy: DeploymentRecord = {
            ...deployments[2],
            id: "deployment-health-failed",
            startedAt: "2026-01-03T00:00:00.000Z",
            healthLog: "healthcheck failed after 3 attempts",
            triggerMeta: {
                healthFailureMessage: "The app is not listening on the expected port.",
            },
            errorClassification: {
                category: "HEALTH_CONNECTION_REFUSED",
                title: "App not listening on port",
                summary: "The app is not listening on the expected port.",
                suggestion: "Make sure the app binds to 0.0.0.0 and uses PORT.",
                logSnippet: "connect: connection refused",
                docsLink: "/docs/deployments/troubleshooting#connection-refused",
            },
        };

        renderDeployments({
            app: { ...app, status: "error" },
            deployments: [failedDeploy],
            latestDeployment: failedDeploy,
            deployErrorClassification: failedDeploy.errorClassification,
            deployErrorRaw: failedDeploy.healthLog,
        });

        expect(screen.getAllByText("App not listening on port").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Make sure the app binds to 0.0.0.0 and uses PORT.").length).toBeGreaterThan(0);
        expect(screen.getAllByText("The app is not listening on the expected port.").length).toBeGreaterThan(0);
    });

    it("health failure shows container logs", () => {
        const failedDeploy: DeploymentRecord = {
            ...deployments[2],
            id: "deployment-health-logs",
            startedAt: "2026-01-03T00:00:00.000Z",
            triggerMeta: {
                healthFailureExitCode: 1,
            },
            errorClassification: {
                category: "HEALTH_CONTAINER_EXITED",
                title: "Container crashed before health check",
                summary: "The container exited before the health check could connect.",
                suggestion: "Check the container logs below for the crash reason.",
                logSnippet: "some error\nexitCode=1",
                docsLink: "/docs/deployments/troubleshooting#container-exited",
            },
        };

        renderDeployments({
            app: { ...app, status: "error" },
            deployments: [failedDeploy],
            latestDeployment: failedDeploy,
            deployErrorClassification: failedDeploy.errorClassification,
        });

        expect(screen.getAllByText("Container Logs").length).toBeGreaterThan(0);
        expect(screen.getAllByText(/some error/).length).toBeGreaterThan(0);
        expect(screen.getAllByText("Exit Code: 1").length).toBeGreaterThan(0);
    });

    it("does not surface stale app errors when the latest deployment succeeded", () => {
        renderDeployments({
            app: { ...app, status: "error" },
            latestDeployment: deployments[0],
            deployErrorClassification: null,
            deployErrorRaw: null,
        });

        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("Succeeded");
        expect(screen.queryByTestId("deploy-error-card")).not.toBeInTheDocument();
        expect(screen.queryByText("Deployment failed")).not.toBeInTheDocument();
    });

    it("shows completed helper copy and a concise latest message after success", () => {
        renderDeployments({
            deployments: [{
                ...deployments[0],
                healthLog: [
                    "starting deploy",
                    "#8 importing cache manifest",
                    "deployment aaaaaaaaaaaa promoted; local URL: http://localhost:3000",
                ].join("\n"),
            }],
            latestDeployment: {
                ...deployments[0],
                healthLog: [
                    "starting deploy",
                    "#8 importing cache manifest",
                    "deployment aaaaaaaaaaaa promoted; local URL: http://localhost:3000",
                ].join("\n"),
            },
        });

        expect(screen.getByText("The release is live and the dashboard has received the terminal result.")).toBeVisible();
        expect(screen.getByText("deployment aaaaaaaaaaaa promoted; local URL: http://localhost:3000")).toBeVisible();
        expect(screen.queryByText("The deployment request is queued and waiting for the next pipeline step.")).not.toBeInTheDocument();
    });

    it("marks same-SHA redeploys without showing duplicate previous version text", () => {
        renderDeployments({
            deployments: [{
                ...deployments[0],
                id: "deployment-retry",
                attemptNumber: 2,
                previousSha: deployments[0].sha,
                retryOfDeploymentId: null,
            }],
            latestDeployment: {
                ...deployments[0],
                id: "deployment-retry",
                attemptNumber: 2,
                previousSha: deployments[0].sha,
                retryOfDeploymentId: null,
            },
        });

        expect(screen.getByText("Same commit redeployed")).toBeVisible();
        expect(screen.queryByText(/Previous version:/i)).not.toBeInTheDocument();
    });

    it("does not mark a skipped lock-busy attempt as the current release truth", () => {
        const skippedLockBusy: DeploymentRecord = {
            id: "deployment-lock-busy",
            sha: "974ff23691bc",
            status: "failed",
            startedAt: "2026-01-03T00:04:00.000Z",
            finishedAt: "2026-01-03T00:04:05.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            healthLog: "Another deployment was already running",
        };
        const realFailure: DeploymentRecord = {
            id: "deployment-real-failure",
            sha: "078f556789ab",
            status: "failed",
            startedAt: "2026-01-03T00:00:00.000Z",
            finishedAt: "2026-01-03T00:03:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            healthLog: "Job timed out",
        };

        renderDeployments({
            app: { ...app, status: "error" },
            deployments: [skippedLockBusy, realFailure],
            latestDeployment: skippedLockBusy,
            deployErrorRaw: "Job timed out",
        });

        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("078f556");
        expect(screen.getByText("Skipped")).toBeVisible();
        expect(screen.getByText("Current")).toBeVisible();
        expect(screen.queryByText("Latest")).not.toBeInTheDocument();
    });

    it("renders server-queued deployments as waiting, not failed", () => {
        const queuedDeployment: DeploymentRecord = {
            id: "deployment-queued",
            sha: "dddddddddddd",
            status: "running",
            startedAt: "2026-01-03T00:04:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            queue: {
                jobId: "job-queued",
                state: "delayed",
                attemptsMade: 1,
                failedReason: null,
                workerPickedAt: null,
                lastProgressAt: "2026-01-03T00:04:05.000Z",
                progress: {
                    phase: "queued",
                    status: "running",
                    percent: 20,
                    line: "Queued on server — another deployment is currently building on this server.",
                },
            },
        };

        renderDeployments({
            app: { ...app, status: "running" },
            deployments: [queuedDeployment, deployments[0]],
            latestDeployment: queuedDeployment,
        });

        const commandCenter = screen.getByTestId("deployment-command-center");
        expect(commandCenter).toHaveTextContent("Queued on Server");
        expect(commandCenter).toHaveTextContent("QUEUED ON SERVER");
        expect(commandCenter).toHaveTextContent("No action needed.");
        expect(screen.getAllByText("Queued on Server").length).toBeGreaterThan(0);
        expect(screen.queryByText("Deployment failed")).not.toBeInTheDocument();
        expect(screen.queryByText("FAILED")).not.toBeInTheDocument();
        expect(screen.queryByTestId("deploy-error-card")).not.toBeInTheDocument();
    });

    it("shows a newer failed candidate while confirming the previous live release stayed running", () => {
        const failedLatest: DeploymentRecord = {
            id: "deployment-failed-latest",
            sha: "f4f4f4f4f4f4",
            status: "failed",
            startedAt: "2026-01-03T00:04:00.000Z",
            finishedAt: "2026-01-03T00:05:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            healthLog: "Build step failed",
        };
        const liveRelease: DeploymentRecord = {
            id: "deployment-live",
            sha: "bbbbbbbbbbbb",
            status: "succeeded",
            startedAt: "2026-01-02T00:00:00.000Z",
            finishedAt: "2026-01-02T00:03:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
        };

        renderDeployments({
            app: { ...app, status: "running" },
            deployments: [failedLatest, liveRelease, deployments[2]],
            latestDeployment: failedLatest,
            deployErrorRaw: "Build step failed",
        });

        const commandCenter = screen.getByTestId("deployment-command-center");
        expect(commandCenter).toHaveTextContent("Failed");
        expect(commandCenter).toHaveTextContent("f4f4f4f");
        expect(commandCenter).toHaveTextContent("bbbbbbb");
        expect(commandCenter).toHaveTextContent("previous live release is still running");
        expect(screen.getAllByText("Build step failed").length).toBeGreaterThan(0);
        expect(screen.getByTestId("deploy-error-card")).toBeVisible();
        expect(screen.getByText("Newest attempt")).toBeVisible();
        expect(screen.getByText("Current")).toBeVisible();
    });

    it("surfaces a failed Safe Deploy CI run while keeping the old release current", () => {
        renderDeployments({
            app: { ...app, status: "running" },
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

        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("Deploy blocked by CI");
        expect(screen.getAllByText("Deploy blocked by CI; old version is still running.").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("GitHub Actions concluded with failure").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("ddddddd").length).toBeGreaterThan(0);
        expect(screen.getAllByText("aaaaaaa").length).toBeGreaterThan(0);
        expect(screen.getByText("CI FAILED")).toBeVisible();
        expect(screen.getByText("Old version still running")).toBeVisible();
        expect(screen.getAllByRole("link", { name: /View GitHub Run/i })[0]).toHaveAttribute(
            "href",
            "https://github.com/acme/checkout/actions/runs/123"
        );
        expect(screen.queryByTestId("deploy-error-card")).not.toBeInTheDocument();
    });

    it("dedupes same-SHA pending CI noise behind the failed GitHub Actions run", () => {
        renderDeployments({
            app: { ...app, status: "running" },
            activeDeployGate: {
                ...activeDeployGate,
                lastCiRun: {
                    id: "ci-pending",
                    deployGateId: "gate-1",
                    deploymentId: null,
                    provider: "github",
                    repoFullName: "acme/checkout",
                    branch: "main",
                    status: "pending",
                    commitSha: "dddddddddddd",
                    runId: "opslin-check-suite",
                    runUrl: null,
                    failureReason: null,
                    createdAt: "2026-01-03T00:00:00.000Z",
                    startedAt: "2026-01-03T00:00:00.000Z",
                    finishedAt: null,
                },
                recentCiRuns: [
                    {
                        id: "ci-pending",
                        deployGateId: "gate-1",
                        deploymentId: null,
                        provider: "github",
                        repoFullName: "acme/checkout",
                        branch: "main",
                        status: "pending",
                        commitSha: "dddddddddddd",
                        runId: "opslin-check-suite",
                        runUrl: null,
                        failureReason: null,
                        createdAt: "2026-01-03T00:00:00.000Z",
                        startedAt: "2026-01-03T00:00:00.000Z",
                        finishedAt: null,
                    },
                    {
                        id: "ci-failed",
                        deployGateId: "gate-1",
                        deploymentId: null,
                        provider: "github",
                        repoFullName: "acme/checkout",
                        branch: "main",
                        status: "failed",
                        commitSha: "dddddddddddd",
                        runId: "github-actions-run",
                        runUrl: "https://github.com/acme/checkout/actions/runs/github-actions-run",
                        failureReason: "GitHub Actions concluded with failure",
                        createdAt: "2026-01-03T00:01:00.000Z",
                        startedAt: "2026-01-03T00:01:00.000Z",
                        finishedAt: "2026-01-03T00:02:00.000Z",
                    },
                ],
                lastDeployment: deployments[0],
                lastDeploymentStatus: "succeeded",
            },
            deployments: [deployments[0], deployments[1]],
            latestDeployment: deployments[0],
        });

        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("Deploy blocked by CI");
        expect(screen.getByText("CI FAILED")).toBeVisible();
        expect(screen.queryByText("CI RUNNING")).not.toBeInTheDocument();
        expect(screen.getAllByText("ddddddd").length).toBeGreaterThan(0);
    });

    it("keeps an older CI-only failure visible after a repaired commit succeeds", () => {
        const repairedDeployment: DeploymentRecord = {
            id: "deployment-v4",
            sha: "eeeeeeeeeeee",
            status: "succeeded",
            startedAt: "2026-01-04T00:00:00.000Z",
            finishedAt: "2026-01-04T00:03:00.000Z",
            triggeredBy: "safe_deploy_gate",
            triggerMeta: { ciRunId: "ci-pass" },
            previousSha: deployments[0].sha,
        };
        const failedCiRun = {
            id: "ci-failed",
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
        };

        renderDeployments({
            app: { ...app, status: "running" },
            activeDeployGate: {
                ...activeDeployGate,
                lastCiRun: {
                    id: "ci-pass",
                    deployGateId: "gate-1",
                    deploymentId: "deployment-v4",
                    provider: "github",
                    repoFullName: "acme/checkout",
                    branch: "main",
                    status: "passed",
                    commitSha: repairedDeployment.sha,
                    runId: "124",
                    runUrl: "https://github.com/acme/checkout/actions/runs/124",
                    failureReason: null,
                    createdAt: "2026-01-04T00:00:00.000Z",
                    startedAt: "2026-01-04T00:00:00.000Z",
                    finishedAt: "2026-01-04T00:01:00.000Z",
                },
                recentCiRuns: [
                    {
                        id: "ci-pass",
                        deployGateId: "gate-1",
                        deploymentId: "deployment-v4",
                        provider: "github",
                        repoFullName: "acme/checkout",
                        branch: "main",
                        status: "passed",
                        commitSha: repairedDeployment.sha,
                        runId: "124",
                        runUrl: "https://github.com/acme/checkout/actions/runs/124",
                        failureReason: null,
                        createdAt: "2026-01-04T00:00:00.000Z",
                        startedAt: "2026-01-04T00:00:00.000Z",
                        finishedAt: "2026-01-04T00:01:00.000Z",
                    },
                    failedCiRun,
                ],
                lastDeployment: repairedDeployment,
                lastDeploymentStatus: "succeeded",
            },
            deployments: [repairedDeployment, deployments[0]],
            latestDeployment: repairedDeployment,
        });

        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("Succeeded");
        expect(screen.getByTestId("deployment-command-center")).toHaveTextContent("eeeeeee");
        expect(screen.queryByTestId("deploy-error-card")).not.toBeInTheDocument();
        expect(screen.getByText("CI FAILED")).toBeVisible();
        expect(screen.getAllByText((content) =>
            content.includes("GitHub Actions concluded with failure")
        ).length).toBeGreaterThan(0);
        expect(screen.getByText("ddddddd")).toBeVisible();
    });
});
