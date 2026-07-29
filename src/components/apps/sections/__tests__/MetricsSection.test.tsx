import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { METRICS_REFETCH_INTERVAL_MS, MetricsSection } from "../MetricsSection";

vi.mock("@/components/apps/app-live-monitor", () => ({
    AppLiveMonitor: ({ enabled, refreshIntervalMs }: { enabled?: boolean; refreshIntervalMs?: number }) => (
        <div data-testid="app-live-monitor" data-enabled={String(enabled)} data-refresh={refreshIntervalMs}>
            Live monitor
        </div>
    ),
}));

vi.mock("@/components/apps/app-observability-panel", () => ({
    AppObservabilityPanel: ({ enabled, refreshIntervalMs }: { enabled?: boolean; refreshIntervalMs?: number }) => (
        <div data-testid="app-observability-panel" data-enabled={String(enabled)} data-refresh={refreshIntervalMs}>
            Observability
        </div>
    ),
}));

function renderMetrics(active: boolean) {
    return render(
        <MetricsSection
            appId="app-1"
            serverId="server-1"
            deployments={[]}
            active={active}
        />
    );
}

describe("MetricsSection", () => {
    it("does not mount heavy metrics components before active", () => {
        renderMetrics(false);

        expect(screen.queryByTestId("app-live-monitor")).not.toBeInTheDocument();
        expect(screen.queryByTestId("app-observability-panel")).not.toBeInTheDocument();
    });

    it("renders metrics components when active", async () => {
        renderMetrics(true);

        expect(await screen.findByTestId("app-live-monitor")).toHaveAttribute("data-enabled", "true");
        expect(await screen.findByTestId("app-observability-panel")).toHaveAttribute("data-enabled", "true");
        expect(screen.getByText("If metrics are not available yet, deploy the app and keep the server agent connected.")).toBeVisible();
    });

    it("uses safe polling and no one-second refresh interval", () => {
        expect(METRICS_REFETCH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
        expect(METRICS_REFETCH_INTERVAL_MS).not.toBe(1_000);
    });
});
