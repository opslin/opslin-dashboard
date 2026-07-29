import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeployLiveView } from "../deploy-live-view";
import { api, type DeploymentRecord } from "@/lib/api";

vi.mock("@/components/logs/enhanced-log-viewer", () => ({
    EnhancedLogViewer: ({ lines }: { lines: string }) => (
        <div data-testid="enhanced-log-viewer">{lines}</div>
    ),
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            getDeploymentDetail: vi.fn(),
        },
    };
});

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

function makeDeployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
    return {
        id: "deploy-1",
        appId: "app-1",
        sha: "abc1234567890",
        attemptNumber: 1,
        status: "running",
        startedAt: "2026-01-01T00:00:00.000Z",
        triggeredBy: "user",
        triggerMeta: {},
        ...overrides,
    };
}

function renderView(
    overrides: Partial<React.ComponentProps<typeof DeployLiveView>> = {},
    deployment: DeploymentRecord = makeDeployment()
) {
    vi.mocked(api.getDeploymentDetail).mockResolvedValue(deployment);
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <DeployLiveView
                mode="inline"
                appId="app-1"
                deploymentId="deploy-1"
                appName="Checkout API"
                {...overrides}
            />
        </QueryClientProvider>
    );
}

describe("DeployLiveView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("WebSocket", MockWebSocket);
        MockWebSocket.instances = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        MockWebSocket.instances = [];
    });

    it("never renders a cancel button anywhere — no such endpoint exists (doc 04 §1.4)", async () => {
        renderView();
        await screen.findByText("abc1234");
        expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    it("shows the real short sha and attempt number from the deployment record", async () => {
        renderView({}, makeDeployment({ sha: "deadbeef123", attemptNumber: 3 }));
        expect(await screen.findByText("deadbee")).toBeInTheDocument();
        expect(screen.getByText("Attempt 3")).toBeInTheDocument();
    });

    it("does not show an attempt label for the first attempt (nothing to disambiguate)", async () => {
        renderView({}, makeDeployment({ attemptNumber: 1 }));
        await screen.findByText("abc1234");
        expect(screen.queryByText(/attempt/i)).not.toBeInTheDocument();
    });

    it("renders the log viewer only when real logs are provided", async () => {
        const { rerender } = renderView({ logs: undefined });
        await screen.findByText("abc1234");
        expect(screen.queryByTestId("enhanced-log-viewer")).not.toBeInTheDocument();

        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        rerender(
            <QueryClientProvider client={queryClient}>
                <DeployLiveView
                    mode="inline"
                    appId="app-1"
                    deploymentId="deploy-1"
                    appName="Checkout API"
                    logs="line one\nline two"
                />
            </QueryClientProvider>
        );
        expect(await screen.findByTestId("enhanced-log-viewer")).toHaveTextContent("line one");
    });

    it("shows retry/rollback actions on a failed deployment, not success actions", async () => {
        const onRetry = vi.fn();
        renderView(
            { onRetry, rollbackAvailable: true, onRollback: vi.fn() },
            makeDeployment({ status: "failed" })
        );
        expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /roll back/i })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /view app/i })).not.toBeInTheDocument();
    });

    it("shows a real 'view app' link on success only when a real domain is known", async () => {
        renderView({ appDomain: "checkout.opslin.app" }, makeDeployment({ status: "succeeded" }));
        const link = await screen.findByRole("link", { name: /view app/i });
        expect(link).toHaveAttribute("href", "https://checkout.opslin.app");
    });

    it("does not show a view-app link on success when no domain is known (never fabricates a URL)", async () => {
        renderView({ appDomain: undefined }, makeDeployment({ status: "succeeded" }));
        await screen.findByText("abc1234");
        expect(screen.queryByRole("link", { name: /view app/i })).not.toBeInTheDocument();
    });

    it("shows the rollback target sha after a real rollback completes", async () => {
        renderView({}, makeDeployment({ status: "rolled_back", previousSha: "aaaaaaa1234" }));
        expect(await screen.findByText(/rolled back to aaaaaaa/i)).toBeInTheDocument();
    });

    it("overlay mode calls onDismiss when the backdrop is clicked", async () => {
        const onDismiss = vi.fn();
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        vi.mocked(api.getDeploymentDetail).mockResolvedValue(makeDeployment());
        const { container } = render(
            <QueryClientProvider client={queryClient}>
                <DeployLiveView
                    mode="overlay"
                    appId="app-1"
                    deploymentId="deploy-1"
                    appName="Checkout API"
                    enabled
                    onDismiss={onDismiss}
                />
            </QueryClientProvider>
        );
        await screen.findByText(`Deploying Checkout API`);
        const backdrop = container.querySelector('[aria-hidden="true"].absolute.inset-0');
        expect(backdrop).toBeTruthy();
        await act(async () => {
            (backdrop as HTMLElement).click();
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("overlay mode renders nothing when not enabled", () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={queryClient}>
                <DeployLiveView
                    mode="overlay"
                    appId="app-1"
                    deploymentId="deploy-1"
                    appName="Checkout API"
                    enabled={false}
                />
            </QueryClientProvider>
        );
        expect(screen.queryByText(/Deploying/i)).not.toBeInTheDocument();
    });
});
