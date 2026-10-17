import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StressStageResult, StressTestResult, StressTestSummary } from "@/lib/api";
import { target } from "./fixtures";

const apiMock = vi.hoisted(() => ({ getSecurityCheck: vi.fn(), startStressTest: vi.fn(), getStressTest: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: apiMock }));
import { ApiRequestError } from "@/lib/api";
import { StressPanel } from "../stress-panel";

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const t = target({ verified: true });

const summary = (over: Partial<StressTestSummary> = {}): StressTestSummary => ({
    id: "s1", targetId: "t1", hostname: "example.com", status: "COMPLETED", progress: null, startedAt: null, completedAt: new Date(Date.now() - 120_000).toISOString(),
    requestCount: 370, errorMessage: null, createdAt: new Date().toISOString(), outcome: "handled", headline: "The site handled up to 10 requests per second without errors or slowdowns.", ...over,
});
const stage = (over: Partial<StressStageResult>): StressStageResult => ({ label: "step", rps: 5, seconds: 20, sent: 100, ok: 100, errors: 0, limited: 0, dropped: 0, achievedRps: 5, p50: 80, p95: 120, p99: 150, unstable: false, statuses: { "200": 100 }, state: "pass", ...over });
const result = (over: Partial<StressTestResult["verdict"]> = {}): StressTestResult => ({
    schema: "x", generatedAt: "2026-10-15T00:00:00.000Z", target: { hostname: "example.com", scheme: "https", path: "/" },
    stages: [stage({ label: "baseline", rps: 1 }), stage({ rps: 2 }), stage({ rps: 5, state: "degraded", p95: 2400, note: "Responses became much slower." }), stage({ rps: 10, state: "skipped" }), stage({ label: "recovery", rps: 1 })],
    baseline: { p50: 80, p95: 120 },
    verdict: { outcome: "slowed", highestPassingRps: 2, firstProblemRps: 5, recovered: true, headline: "The site answered everything but became much slower at 5 requests per second.", details: ["After the traffic stopped, the site went back to normal."], ...over },
    scope: { requests: 200, cachedShare: null, stoppedEarly: null, ms: 60_000 }, limitations: ["This sent a small, capped amount of traffic from one place to your home page only."],
});
const overview = (latestStress: StressTestSummary | null, used = 1) => ({ usage: { used: 1, limit: 20, resetsAt: "" }, stressUsage: { used, limit: 10, resetsAt: "" }, targets: [{ ...t, latestStress }] });

beforeEach(() => vi.clearAllMocks());

describe("stress panel", () => {
    it("starts as a quiet row and asks for confirmation before sending anything", async () => {
        apiMock.getSecurityCheck.mockResolvedValue(overview(null));
        wrap(<StressPanel target={t} />);
        expect(await screen.findByText("Not run yet")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Run test" }));
        expect(screen.getByText(/up to 10 requests per second to https:\/\/example.com\//)).toBeInTheDocument();
        expect(apiMock.startStressTest).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByText(/Only run it on a site you are happy to test/)).toBeNull();
        expect(apiMock.startStressTest).not.toHaveBeenCalled();
    });

    it("starts the test only after Start test", async () => {
        apiMock.getSecurityCheck.mockResolvedValue(overview(null));
        apiMock.startStressTest.mockResolvedValue({ stress: summary({ status: "QUEUED" }), stressUsage: { used: 2, limit: 10, resetsAt: "" } });
        wrap(<StressPanel target={t} />);
        fireEvent.click(await screen.findByRole("button", { name: "Run test" }));
        fireEvent.click(screen.getByRole("button", { name: "Start test" }));
        await waitFor(() => expect(apiMock.startStressTest).toHaveBeenCalledWith("t1"));
    });

    it("shows the reason when the server refuses, and keeps the confirmation open", async () => {
        apiMock.getSecurityCheck.mockResolvedValue(overview(null));
        apiMock.startStressTest.mockRejectedValue(new ApiRequestError(429, { message: "This domain was stress-tested a moment ago.", code: "cooldown" } as never));
        wrap(<StressPanel target={t} />);
        fireEvent.click(await screen.findByRole("button", { name: "Run test" }));
        fireEvent.click(screen.getByRole("button", { name: "Start test" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("stress-tested a moment ago");
        expect(screen.getByRole("button", { name: "Start test" })).toBeInTheDocument();
    });

    it("shows live progress while a test runs, with the button off", async () => {
        const running = summary({ status: "RUNNING", completedAt: null, progress: { phase: "5 per second", done: 2, total: 5 } });
        apiMock.getSecurityCheck.mockResolvedValue(overview(running));
        apiMock.getStressTest.mockResolvedValue({ stress: running, result: null });
        wrap(<StressPanel target={t} />);
        expect(await screen.findByText("Sending 5 per second…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run again" })).toBeDisabled();
    });

    it("shows the verdict, each step, and the limits", async () => {
        apiMock.getSecurityCheck.mockResolvedValue(overview(summary()));
        apiMock.getStressTest.mockResolvedValue({ stress: summary(), result: result() });
        wrap(<StressPanel target={t} />);
        expect(await screen.findByText(/became much slower at 5 requests per second/)).toBeInTheDocument();
        expect(screen.getAllByText("Quiet start (1 per second)").length).toBeGreaterThan(0);
        expect(screen.getByText("Much slower")).toBeInTheDocument();
        expect(screen.getByText("Not run")).toBeInTheDocument();
        expect(screen.getAllByText("After the traffic (1 per second)").length).toBeGreaterThan(0);
        expect(screen.getByText(/Last run/)).toBeInTheDocument();
        expect(screen.getByText(/capped amount of traffic/)).toBeInTheDocument();
    });

    it("explains a test that did not run, using the server's plain reason", async () => {
        const failed = summary({ status: "FAILED", completedAt: null, outcome: null, headline: null, errorMessage: "The site is already answering with an error (status 500), so the test was not started. Fix that first." });
        apiMock.getSecurityCheck.mockResolvedValue(overview(failed));
        apiMock.getStressTest.mockResolvedValue({ stress: failed, result: null });
        wrap(<StressPanel target={t} />);
        expect(await screen.findByText(/already answering with an error/)).toBeInTheDocument();
        expect(screen.getByText("Didn't run")).toBeInTheDocument();
    });

    it("turns the button off and says so when the monthly allowance is used", async () => {
        apiMock.getSecurityCheck.mockResolvedValue(overview(null, 10));
        wrap(<StressPanel target={t} />);
        expect(await screen.findByText(/used all 10 stress tests/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run test" })).toBeDisabled();
    });
});
