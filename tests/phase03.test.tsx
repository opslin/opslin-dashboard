import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnhancedLogViewer } from "../src/components/logs/enhanced-log-viewer";
import {
  ansiToSafeHtml,
  detectLogLevel,
  filterLogLines,
  formatLogDownload,
  parseLogLines,
  stripAnsi,
} from "../src/lib/logs";
import {
  activityIconForEvent,
  formatActivityDescription,
} from "../src/lib/activity";
import {
  formatBytes,
  latestMetricPoint,
  memoryPercent,
} from "../src/lib/live-monitor";

describe("Phase 03 log parsing and activity utilities", () => {
  it("detects explicit and inferred log levels", () => {
    expect(detectLogLevel("2026-04-26 INFO ok", "INFO")).toBe("info");
    expect(detectLogLevel("panic: failed to boot")).toBe("error");
    expect(detectLogLevel("warning slow query")).toBe("warn");
  });

  it("parses timestamped deployment log lines", () => {
    const lines = parseLogLines("2026-04-26T05:00:00.000Z ERROR build failed");

    expect(lines[0]).toMatchObject({
      timestamp: "2026-04-26T05:00:00.000Z",
      level: "error",
      message: "build failed",
    });
  });

  it("strips ANSI escape codes for filtering", () => {
    expect(stripAnsi("\u001b[31mERROR\u001b[0m")).toBe("ERROR");
  });

  it("converts ANSI to escaped HTML without preserving unsafe tags", () => {
    const html = ansiToSafeHtml("\u001b[31m<script>alert(1)</script>\u001b[0m");

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("filters log lines with literal search", () => {
    const lines = parseLogLines("INFO ready\nERROR payment failed");

    expect(filterLogLines(lines, { query: "payment", level: "all" })).toHaveLength(1);
  });

  it("filters log lines with regex search", () => {
    const lines = parseLogLines("INFO /orders/123\nINFO /users/abc");

    expect(filterLogLines(lines, { query: "/orders/\\d+", regex: true })).toHaveLength(1);
  });

  it("returns no log lines for invalid regex input", () => {
    const lines = parseLogLines("INFO ready");

    expect(filterLogLines(lines, { query: "[", regex: true })).toEqual([]);
  });

  it("formats logs for download", () => {
    const lines = parseLogLines("2026-04-26T05:00:00.000Z WARN slow query");

    expect(formatLogDownload(lines)).toContain("WARN");
    expect(formatLogDownload(lines)).toContain("slow query");
  });

  it("keeps 100k-line log sets virtualized instead of rendering every row", () => {
    const lines = parseLogLines(Array.from({ length: 100_000 }, (_, index) => `INFO line-${index}`).join("\n"));

    expect(lines).toHaveLength(100_000);
    render(<EnhancedLogViewer lines={lines} />);
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("100,000 of 100,000 lines");
    expect(screen.queryByText("line-99999")).not.toBeInTheDocument();
  });

  it("formats byte and memory metrics", () => {
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(memoryPercent({ memoryUsed: 512, memoryLimit: 1024 })).toBe(50);
  });

  it("reads the latest metric point from history", () => {
    expect(latestMetricPoint({
      range: "1h",
      healthStatus: "healthy",
      series: {
        timestamps: ["a", "b"],
        cpu: [10, 20],
        memoryPercent: [30, 40],
        restartCount: [0, 1],
      },
    })).toEqual({ timestamp: "b", cpu: 20, memory: 40, restartCount: 1 });
  });

  it("maps activity events to stable icon names", () => {
    expect(activityIconForEvent("deploy.started")).toBe("rocket");
    expect(activityIconForEvent("firewall.applied")).toBe("shield");
  });

  it("formats activity descriptions from metadata", () => {
    expect(formatActivityDescription({
      event: "server.claim",
      metadata: { serverName: "MacBook" },
      targetType: "server",
    })).toBe("Server MacBook was claimed");
  });

  it("renders the enhanced log viewer with line counts and level filters", () => {
    render(<EnhancedLogViewer lines={"INFO ready\nERROR failed"} />);

    expect(screen.getByTestId("enhanced-log-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("2 of 2 lines");

    fireEvent.change(screen.getByLabelText("Log level filter"), { target: { value: "error" } });

    expect(screen.getByTestId("log-line-count")).toHaveTextContent("1 of 2 lines");
  });

  it("highlights searched rows and copies a single line on click", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<EnhancedLogViewer lines={"INFO ready\nERROR failed"} />);

    fireEvent.change(screen.getByPlaceholderText("Search logs"), { target: { value: "failed" } });
    const row = screen.getByTitle("Copy log line");
    expect(row.className).toContain("bg-primary/10");

    fireEvent.click(row);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("failed"));
  });

  it("pauses auto-scroll when the user scrolls away from the bottom", () => {
    render(<EnhancedLogViewer lines={Array.from({ length: 80 }, (_, index) => `INFO line-${index}`).join("\n")} />);

    const list = screen.getByTestId("enhanced-log-list");
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 4000 },
      scrollTop: { configurable: true, value: 0 },
      clientHeight: { configurable: true, value: 400 },
    });
    fireEvent.scroll(list);

    expect(screen.getByText("Auto-scroll paused")).toBeInTheDocument();
  });
});
