import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeploymentLive } from "../use-deployment-live";
import type { App, DeployGateSummary, DeploymentRecord } from "@/lib/api";

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((message: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.();
    }
}

function TestComponent({ appId }: { appId: string }) {
    const live = useDeploymentLive(appId);
    return (
        <div>
            <div data-testid="live-status">{live.status}</div>
            <div data-testid="live-stale">{String(live.isStale)}</div>
        </div>
    );
}

function renderHookWithClient(queryClient: QueryClient, appId = "app-1") {
    return render(
        <QueryClientProvider client={queryClient}>
            <TestComponent appId={appId} />
        </QueryClientProvider>
    );
}

const app: App = {
    id: "app-1",
    name: "Checkout API",
    status: "error",
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    port: 3000,
    envVars: {},
    createdAt: "2026-01-01T00:00:00.000Z",
};

const deployment: DeploymentRecord = {
    id: "deployment-live-1",
    appId: "app-1",
    sha: "abc123456789",
    status: "pending",
    startedAt: "2026-01-02T00:00:00.000Z",
    triggeredBy: "github_push",
    triggerMeta: { source: "github_push" },
};

describe("useDeploymentLive", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        MockWebSocket.instances = [];
    });

    it("patches deployment, app, deploy gate, and check report caches from live events", () => {
        vi.stubGlobal("WebSocket", MockWebSocket);
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        queryClient.setQueryData(["appDeployments", "app-1"], [] as DeploymentRecord[]);
        queryClient.setQueryData(["app", "app-1"], {
            app,
            server: { id: "server-1", status: "disconnected", isLiveConnected: false },
        });
        queryClient.setQueryData(["deployGates", "app-1"], [{
            id: "gate-1",
            appId: "app-1",
            organizationId: "org-1",
            provider: "github",
            repoFullName: "acme/checkout",
            branch: "main",
            mode: "safe",
            enabled: true,
            tokenLastUsedAt: null,
            setupStatus: "ready",
            setupMessage: "Ready",
            workflowInstalled: true,
            workflowInstalledBranch: "main",
            lastCiRun: null,
            lastDeploymentStatus: null,
        }] as DeployGateSummary[]);

        renderHookWithClient(queryClient);
        const socket = MockWebSocket.instances[0];
        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        expect(screen.getByTestId("live-status")).toHaveTextContent("connected");

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "deployment_created",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    deployment,
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeploymentRecord[]>(["appDeployments", "app-1"])?.[0]).toMatchObject({
            id: deployment.id,
            sha: deployment.sha,
        });
        expect(queryClient.getQueryData<DeploymentRecord>(["deploymentDetail", "app-1", deployment.id])).toMatchObject({
            id: deployment.id,
        });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "job_progress",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    progress: {
                        phase: "building",
                        percentage: 42,
                        message: "Building image",
                        updatedAt: "2026-01-02T00:01:00.000Z",
                    },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeploymentRecord>(["deploymentDetail", "app-1", deployment.id])?.queue?.progress)
            .toMatchObject({ phase: "building", percentage: 42 });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "job_progress",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    progress: {
                        phase: "queued",
                        status: "running",
                        percent: 20,
                        line: "Queued on server — another deployment is currently building on this server.",
                        updatedAt: "2026-01-02T00:01:15.000Z",
                    },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeploymentRecord>(["deploymentDetail", "app-1", deployment.id])?.queue?.progress)
            .toMatchObject({ phase: "queued", status: "running", percent: 20 });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "app_status",
                    appId: "app-1",
                    app: { id: "app-1", status: "deploying", deployLogs: "Building image", port: 3000 },
                    agentStatus: { serverId: "server-1", status: "CONNECTED", connected: true },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<{ app: App; server: { isLiveConnected: boolean } }>(["app", "app-1"]))
            .toMatchObject({
                app: { status: "deploying", deployLogs: "Building image" },
                server: { isLiveConnected: true },
            });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "ci_run_updated",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    ciRun: {
                        id: "ci-1",
                        deployGateId: "gate-1",
                        status: "passed",
                        commitSha: deployment.sha,
                    },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeployGateSummary[]>(["deployGates", "app-1"])?.[0].lastCiRun)
            .toMatchObject({ id: "ci-1", status: "passed" });
        expect(queryClient.getQueryData<DeployGateSummary[]>(["deployGates", "app-1"])?.[0].recentCiRuns?.[0])
            .toMatchObject({ id: "ci-1", status: "passed" });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "check_report_updated",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    checkReport: {
                        id: "report-1",
                        deploymentId: deployment.id,
                        status: "passed",
                    },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeploymentRecord & { checkReport?: unknown }>(["deploymentDetail", "app-1", deployment.id])?.checkReport)
            .toMatchObject({ id: "report-1", status: "passed" });
        expect(queryClient.getQueryData<DeploymentRecord[]>(["appDeployments", "app-1"])?.[0].checkReport)
            .toMatchObject({ id: "report-1", status: "passed" });
    });

    it("marks the live connection stale when an open socket stops delivering events", () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", MockWebSocket);
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });

        renderHookWithClient(queryClient);
        const socket = MockWebSocket.instances[0];
        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        expect(screen.getByTestId("live-status")).toHaveTextContent("connected");
        expect(screen.getByTestId("live-stale")).toHaveTextContent("false");

        act(() => {
            vi.advanceTimersByTime(16_000);
        });

        expect(screen.getByTestId("live-stale")).toHaveTextContent("true");
        vi.useRealTimers();
    });

    it("does not downgrade a terminal deployment when a late running event arrives", () => {
        vi.stubGlobal("WebSocket", MockWebSocket);
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        const completed: DeploymentRecord = {
            ...deployment,
            status: "succeeded",
            finishedAt: "2026-01-02T00:03:00.000Z",
            healthLog: "Deployment succeeded",
        };
        queryClient.setQueryData(["appDeployments", "app-1"], [completed]);
        queryClient.setQueryData(["deploymentDetail", "app-1", deployment.id], completed);

        renderHookWithClient(queryClient);
        const socket = MockWebSocket.instances[0];
        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "deployment_updated",
                    appId: "app-1",
                    deploymentId: deployment.id,
                    deployment: {
                        ...deployment,
                        status: "running",
                        finishedAt: null,
                        healthLog: null,
                    },
                }),
            } as MessageEvent);
        });

        expect(queryClient.getQueryData<DeploymentRecord[]>(["appDeployments", "app-1"])?.[0])
            .toMatchObject({
                status: "succeeded",
                finishedAt: "2026-01-02T00:03:00.000Z",
                healthLog: "Deployment succeeded",
            });
    });
});
