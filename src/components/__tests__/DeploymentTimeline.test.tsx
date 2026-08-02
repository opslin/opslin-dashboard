import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock the api module
const apiMocks = vi.hoisted(() => {
    class MockApiRequestError extends Error {
        status: number;
        details: { message: string; [key: string]: unknown };

        constructor(status: number, details: { message: string; [key: string]: unknown }) {
            super(details.message || `Request failed with status ${status}`);
            this.name = "ApiRequestError";
            this.status = status;
            this.details = details;
        }
    }

    return {
        ApiRequestError: MockApiRequestError,
        mockGetDeploymentDetail: vi.fn(),
    };
});

const mockGetDeploymentDetail = apiMocks.mockGetDeploymentDetail;

vi.mock("@/lib/api", () => ({
    api: {
        getDeploymentDetail: (...args: unknown[]) => mockGetDeploymentDetail(...args),
    },
    ApiRequestError: apiMocks.ApiRequestError,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
    CheckCircle2: ({ className }: { className?: string }) => (
        <span data-testid="icon-check" className={className}>✓</span>
    ),
    Circle: ({ className }: { className?: string }) => (
        <span data-testid="icon-circle" className={className}>○</span>
    ),
    Loader2: ({ className }: { className?: string }) => (
        <span data-testid="icon-loader" className={className}>⟳</span>
    ),
    XCircle: ({ className }: { className?: string }) => (
        <span data-testid="icon-x" className={className}>✗</span>
    ),
}));

// Mock shadcn/ui components
vi.mock("@/components/ui/badge", () => ({
    Badge: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
        <span data-testid="badge" {...props}>{children}</span>
    ),
}));

vi.mock("@/lib/utils", () => ({
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
    formatRelativeTime: (date: string) => `relative(${date})`,
}));

import { DeploymentTimeline } from "@/components/DeploymentTimeline";
import { ApiRequestError, type DeploymentRecord } from "@/lib/api";

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const baseDeployment: DeploymentRecord = {
    id: "deploy-1",
    sha: "abc1234567890",
    status: "succeeded",
    startedAt: "2026-04-29T01:00:00.000Z",
    triggeredBy: "safe_deploy_gate",
    triggerMeta: {},
};

describe("DeploymentTimeline", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders all stages for safe_with_health mode", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={baseDeployment}
                mode="safe_with_health"
            />,
            { wrapper }
        );

        expect(screen.getByText("Queued")).toBeVisible();
        expect(screen.getByText("GitHub Actions Running")).toBeVisible();
        expect(screen.getByText("CI Passed")).toBeVisible();
        expect(screen.getByText("Queued for Server Worker")).toBeVisible();
        expect(screen.getByText("Fetching source")).toBeVisible();
        expect(screen.getByText("Building image")).toBeVisible();
        expect(screen.getByText("Starting/promoting candidate")).toBeVisible();
        expect(screen.getByText("Running health check")).toBeVisible();
        expect(screen.getByText("Running Virtual-User Test")).toBeVisible();
        expect(screen.getByText("Deployment Complete")).toBeVisible();
    });

    it("shows completed state when deployment succeeded", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "succeeded" }}
                mode="safe"
            />,
            { wrapper }
        );

        expect(screen.getByText("Deployment Complete")).toBeVisible();
    });

    it("shows failed state when deployment failed", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "failed", healthLog: "Container crashed" }}
                mode="safe"
            />,
            { wrapper }
        );

        expect(screen.getByText("Container crashed")).toBeVisible();
    });

    it("shows 'No deployment has started yet' when no deployment provided", () => {
        render(
            <DeploymentTimeline appId="app-1" mode="safe" />,
            { wrapper }
        );

        expect(screen.getByText("No deployment has started yet.")).toBeVisible();
    });

    it("does not render polling query when poll is false", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deploymentId="deploy-1"
                deployment={baseDeployment}
                mode="safe"
                poll={false}
            />,
            { wrapper }
        );

        // getDeploymentDetail should not be called when poll is false
        expect(mockGetDeploymentDetail).not.toHaveBeenCalled();
    });

    it("does not call getDeploymentDetail when deploymentId is undefined", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={baseDeployment}
                mode="safe"
                poll={true}
            />,
            { wrapper }
        );

        expect(mockGetDeploymentDetail).not.toHaveBeenCalled();
    });

    it("retries deployment-detail 404s by ApiRequestError status", async () => {
        // The message intentionally omits "404"; status is the contract.
        mockGetDeploymentDetail.mockRejectedValue(new ApiRequestError(404, { message: "Deployment not found" }));

        render(
            <DeploymentTimeline
                appId="app-1"
                deploymentId="deploy-missing"
                mode="safe"
                poll={true}
            />,
            { wrapper }
        );

        await waitFor(() => {
            expect(mockGetDeploymentDetail).toHaveBeenCalledTimes(4);
        }, { timeout: 9_000 });
    }, 10_000);

    it("renders sha and relative time for active deployment", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={baseDeployment}
                mode="safe"
            />,
            { wrapper }
        );

        expect(screen.getByText(/abc1234/)).toBeVisible();
    });

    it("shows a provider-aware label while an agent-runner test is running (not GitHub Actions)", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "pending" }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    provider: "agent",
                    status: "pending",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText("Running Tests on Your Server")).toBeVisible();
        expect(screen.queryByText("GitHub Actions Running")).toBeNull();
    });

    it("keeps the GitHub Actions label for a github-provider (or legacy providerless) pending CI run", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "pending" }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "pending",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText("GitHub Actions Running")).toBeVisible();
    });

    it("shows CI Failed when ciRun status is failed", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={baseDeployment}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "failed",
                    commitSha: "abc1234",
                    failureReason: "npm test failed",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText("npm test failed")).toBeVisible();
    });

    it("shows errorMessage when provided with a failed deployment", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "failed" }}
                mode="safe"
                errorMessage="Agent disconnected during deploy"
            />,
            { wrapper }
        );

        expect(screen.getByText("Agent disconnected during deploy")).toBeVisible();
    });

    it("displays errorClassification summary from deployment", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{
                    ...baseDeployment,
                    status: "failed",
                    errorClassification: {
                        category: "health_failed",
                        title: "Health check failed",
                        summary: "Server returned 503",
                        suggestion: "Check application health endpoint",
                        logSnippet: "",
                        docsLink: "",
                    },
                }}
                mode="safe"
            />,
            { wrapper }
        );

        expect(screen.getByText("Server returned 503")).toBeVisible();
    });

    it("shows fast deploy stages without CI stages", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={baseDeployment}
                mode="fast"
            />,
            { wrapper }
        );

        expect(screen.getByText("Queued")).toBeVisible();
        expect(screen.getByText("Starting/promoting candidate")).toBeVisible();
        expect(screen.getByText("Running health check")).toBeVisible();
        expect(screen.getByText("Deployment Complete")).toBeVisible();
        expect(screen.queryByText("GitHub Actions Running")).toBeNull();
        expect(screen.queryByText("CI Passed")).toBeNull();
    });

    it("shows Queued for Server Worker when CI passed and deployment is pending (safe mode)", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "pending" }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "passed",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        // Should show the new queued_for_worker stage as active, not the agent stage.
        expect(screen.getByText("Queued for Server Worker")).toBeVisible();
        // The deploying stage should exist but not be active.
        expect(screen.getByText("Starting/promoting candidate")).toBeVisible();
    });

    it("shows the agent deploy phase when deployment is running", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "running" }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "passed",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText("Starting/promoting candidate")).toBeVisible();
    });

    it.each([
        ["waiting", "Waiting in deploy queue..."],
        ["delayed", "Deployment job is delayed for retry..."],
        ["failed", "Deployment job failed before reaching the agent."],
        ["unknown", "Deployment job is missing from the queue."],
    ] as const)("shows queue detail text for %s pending deployments", (state, message) => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{
                    ...baseDeployment,
                    status: "pending",
                    queue: {
                        jobId: "deploy-job-1",
                        state,
                    },
                }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "passed",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText(message)).toBeVisible();
    });

    it("shows default worker queue detail when queue state is unavailable", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{
                    ...baseDeployment,
                    status: "pending",
                    queue: {
                        jobId: "deploy-job-1",
                        state: null,
                    },
                }}
                mode="safe"
                ciRun={{
                    id: "ci-1",
                    status: "passed",
                    commitSha: "abc1234",
                    createdAt: "2026-04-29T00:00:00.000Z",
                }}
            />,
            { wrapper }
        );

        expect(screen.getByText("Deployment job is waiting for the Opslin worker")).toBeVisible();
    });

    it("does not show Queued for Server Worker in fast mode", () => {
        render(
            <DeploymentTimeline
                appId="app-1"
                deployment={{ ...baseDeployment, status: "pending" }}
                mode="fast"
            />,
            { wrapper }
        );

        expect(screen.queryByText("Queued for Server Worker")).toBeNull();
    });
});
