import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { METRICS_REFETCH_INTERVAL_MS, MetricsSection } from "../MetricsSection";
import { api, ApiRequestError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            getAppMetricsHistory: vi.fn(),
            getAppMetricsCurrent: vi.fn(),
            getRequestSummary: vi.fn(),
            getRequestLatency: vi.fn(),
        },
    };
});

function renderMetrics(active: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MetricsSection appId="app-1" serverId="server-1" deployments={[]} active={active} />
        </QueryClientProvider>
    );
}

const history = {
    range: "24h",
    healthStatus: "healthy" as const,
    healthChecks: { total: 10, healthy: 10, uptimePercent: 100 },
    series: { timestamps: ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"], cpu: [20, 30], memoryPercent: [40, 42], restartCount: [0, 0] },
};

describe("MetricsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getAppMetricsHistory).mockResolvedValue(history);
        vi.mocked(api.getAppMetricsCurrent).mockResolvedValue({ id: "app-1", name: "A", status: "running", healthStatus: "healthy", healthPath: "/", cpuPercent: 23, memoryUsed: 335544320, memoryLimit: 1073741824 });
        vi.mocked(api.getRequestSummary).mockResolvedValue({ appId: "app-1", window: "24h", totalRequests: 12400, errorRequests: 25, errorRate: 0.2, successRate: 99.8, avgResponseMs: 84, bytesPerSecond: 1 });
        vi.mocked(api.getRequestLatency).mockResolvedValue({ appId: "app-1", window: "24h", series: [{ bucket: "2026-01-01T00:00:00Z", p50: 80, p95: 1, p99: 1 }] });
    });

    it("does not fetch before the Metrics section is active", () => {
        renderMetrics(false);

        expect(api.getAppMetricsHistory).not.toHaveBeenCalled();
    });

    it("shows the four real numbers and a restart summary", async () => {
        renderMetrics(true);

        expect(await screen.findByText("23%")).toBeVisible();
        expect(screen.getByText("320 MB")).toBeVisible();
        expect(screen.getByText("12,400")).toBeVisible();
        expect(screen.getByText("84 ms")).toBeVisible();
        expect(screen.getByText("Restarts: 0 in the last 24 hours")).toBeVisible();
    });

    it("refetches when the range changes", async () => {
        renderMetrics(true);

        await screen.findByText("23%");
        fireEvent.click(screen.getByRole("button", { name: "7d" }));
        await waitFor(() => expect(api.getAppMetricsHistory).toHaveBeenCalledWith("app-1", "7d"));
    });

    it("shows a plan note instead of fake request numbers when analytics isn't included", async () => {
        vi.mocked(api.getRequestSummary).mockRejectedValue(new ApiRequestError(403, { message: "feature_not_available" }));
        renderMetrics(true);

        expect(await screen.findByText(/part of a paid plan/i)).toBeVisible();
    });

    it("uses safe polling and no one-second refresh interval", () => {
        expect(METRICS_REFETCH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
        expect(METRICS_REFETCH_INTERVAL_MS).not.toBe(1_000);
    });
});
