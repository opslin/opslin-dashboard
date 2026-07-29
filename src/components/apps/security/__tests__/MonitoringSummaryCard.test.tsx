import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitoringSummaryCard } from "../MonitoringSummaryCard";
import type { AppMetricCurrent } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function makeMetric(overrides: Partial<AppMetricCurrent> = {}): AppMetricCurrent {
  return {
    id: "metric-1",
    name: "test-app",
    status: "running",
    healthStatus: "healthy",
    healthPath: "/health",
    cpuPercent: 42.3,
    memoryUsed: 256 * 1024 * 1024, // 256 MB
    memoryLimit: 512 * 1024 * 1024, // 512 MB
    restartCount: 2,
    ...overrides,
  };
}

describe("MonitoringSummaryCard", () => {
  describe("empty state", () => {
    it("renders the empty-state message when metric is null", () => {
      render(
        <MonitoringSummaryCard metric={null} appStatusFallback="running" />
      );

      expect(screen.getByTestId("monitoring-empty-state")).toBeInTheDocument();
      expect(screen.getByText("Metrics are not yet available.")).toBeInTheDocument();
    });

    it("does not render metric values when metric is null", () => {
      render(
        <MonitoringSummaryCard metric={null} appStatusFallback="running" />
      );

      expect(screen.queryByTestId("monitoring-metrics")).not.toBeInTheDocument();
    });

    it("does not render empty-state when metric is provided", () => {
      render(
        <MonitoringSummaryCard metric={makeMetric()} appStatusFallback="running" />
      );

      expect(screen.queryByTestId("monitoring-empty-state")).not.toBeInTheDocument();
    });
  });

  describe("metric labels", () => {
    it("renders exactly four metric labels when metric is provided", () => {
      render(
        <MonitoringSummaryCard metric={makeMetric()} appStatusFallback="running" />
      );

      const metricsContainer = screen.getByTestId("monitoring-metrics");
      // Four metric labels: Status, CPU, Memory, Restarts
      const labels = metricsContainer.querySelectorAll("p.text-xs");
      expect(labels).toHaveLength(4);
    });
  });

  describe("CPU% formatting", () => {
    it("renders CPU% with at most one decimal place", () => {
      render(
        <MonitoringSummaryCard
          metric={makeMetric({ cpuPercent: 42.3456 })}
          appStatusFallback="running"
        />
      );

      const cpuEl = screen.getByTestId("metric-cpu");
      const text = cpuEl.textContent ?? "";
      // Extract the numeric part before the % sign
      const match = text.match(/^(\d+\.?\d*)%$/);
      expect(match).not.toBeNull();
      const decimalPart = match![1].split(".")[1];
      // At most one decimal place
      expect(!decimalPart || decimalPart.length <= 1).toBe(true);
    });

    it("renders CPU% with exactly one decimal place for fractional values", () => {
      render(
        <MonitoringSummaryCard
          metric={makeMetric({ cpuPercent: 99.9 })}
          appStatusFallback="running"
        />
      );

      expect(screen.getByTestId("metric-cpu")).toHaveTextContent("99.9%");
    });
  });

  describe("memory formatting", () => {
    it("renders memory used and memory limit with the same unit string", () => {
      render(
        <MonitoringSummaryCard
          metric={makeMetric({ memoryUsed: 256 * 1024 * 1024, memoryLimit: 512 * 1024 * 1024 })}
          appStatusFallback="running"
        />
      );

      const memoryEl = screen.getByTestId("metric-memory");
      const text = memoryEl.textContent ?? "";
      // Format is "X / Y UNIT" — the unit appears once at the end, shared by both values
      const match = text.match(/^[\d.]+ \/ [\d.]+ (\w+)$/);
      expect(match).not.toBeNull();
      // The unit string appears only once (shared), confirming both values use the same unit
      expect(match![1]).toBeTruthy();
    });

    it("uses the same unit for both used and limit even with different magnitudes", () => {
      render(
        <MonitoringSummaryCard
          metric={makeMetric({ memoryUsed: 1024, memoryLimit: 1024 * 1024 * 1024 })}
          appStatusFallback="running"
        />
      );

      const memoryEl = screen.getByTestId("metric-memory");
      const text = memoryEl.textContent ?? "";
      // Should still follow "X / Y UNIT" pattern with a single unit
      const match = text.match(/^[\d.]+ \/ [\d.]+ (\w+)$/);
      expect(match).not.toBeNull();
    });
  });

  describe("restart count styling (Property P13)", () => {
    it("restart-count element uses the same className as CPU% and memory value elements", () => {
      render(
        <MonitoringSummaryCard metric={makeMetric()} appStatusFallback="running" />
      );

      const cpuEl = screen.getByTestId("metric-cpu");
      const memoryEl = screen.getByTestId("metric-memory");
      const restartsEl = screen.getByTestId("metric-restarts");

      expect(restartsEl.className).toBe(cpuEl.className);
      expect(restartsEl.className).toBe(memoryEl.className);
    });
  });

  describe("restart count does not use warning styling (Requirement 10.5)", () => {
    it.each([6, 50, 1000])(
      "does not apply red/orange/yellow/amber tokens, warning icons, badges, or animated emphasis when restartCount is %i",
      (restartCount) => {
        render(
          <MonitoringSummaryCard
            metric={makeMetric({ restartCount })}
            appStatusFallback="running"
          />
        );

        const restartsEl = screen.getByTestId("metric-restarts");
        const className = restartsEl.className;

        // No red, orange, yellow, or amber color tokens
        expect(className).not.toMatch(/(?:^|\s|-)(red|orange|yellow|amber)-\d+/);

        // No warning icons inside the restart element
        const svgs = restartsEl.querySelectorAll("svg");
        expect(svgs).toHaveLength(0);

        // No badge elements
        const badges = restartsEl.querySelectorAll('[class*="badge"]');
        expect(badges).toHaveLength(0);

        // No animated emphasis (animate- classes)
        expect(className).not.toMatch(/animate-/);
      }
    );
  });

  describe("monitoring link", () => {
    it("renders exactly one /monitoring link", () => {
      render(
        <MonitoringSummaryCard metric={makeMetric()} appStatusFallback="running" />
      );

      const links = screen.getAllByRole("link");
      const monitoringLinks = links.filter(
        (link) => link.getAttribute("href") === "/monitoring"
      );
      expect(monitoringLinks).toHaveLength(1);
    });

    it("renders the /monitoring link even when metric is null", () => {
      render(
        <MonitoringSummaryCard metric={null} appStatusFallback="running" />
      );

      const links = screen.getAllByRole("link");
      const monitoringLinks = links.filter(
        (link) => link.getAttribute("href") === "/monitoring"
      );
      expect(monitoringLinks).toHaveLength(1);
    });
  });
});
