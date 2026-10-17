import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostCheckReport, HostCheckSummary } from "@/lib/api";

const apiMock = vi.hoisted(() => ({ getHostCheck: vi.fn(), getHostCheckById: vi.fn(), getHostCheckHistory: vi.fn(), startHostCheck: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: apiMock }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { ApiRequestError } from "@/lib/api";
import { ServerCheckPage } from "../server-check-page";
import { ServerCheckRow } from "../server-check-row";

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const check = (over: Partial<HostCheckSummary> = {}): HostCheckSummary => ({
    id: "c1", serverId: "s1", status: "COMPLETED", startedAt: null, completedAt: new Date(Date.now() - 3_600_000).toISOString(), score: 76, grade: "C", graded: true, coverage: 0.95,
    counts: { critical: 0, high: 1, medium: 1, low: 0, review: 1 }, privilege: "root", agentVersion: "2.0.40", errorMessage: null, createdAt: new Date().toISOString(), ...over,
});
const finding = { ruleId: "OPS-ACC-001", fingerprint: "f1", rootCause: "r", asset: "sshd", area: "access", state: "fail" as const, severity: "high" as const, confidence: "high" as const, title: "SSH accepts passwords for root", observation: "sshd -T: permitrootlogin yes", why: "Passwords can be guessed.", fix: "Set PermitRootLogin prohibit-password.", verify: "Run sshd -T." };
const report = (over: Partial<HostCheckReport> = {}): HostCheckReport => ({
    schema: "opslin.server-check.report/1", generatedAt: "2026-10-15T10:00:00Z", profile: "host-baseline-v1",
    manifest: [{ id: "OPS-ACC-001", area: "access", title: "Root cannot log in with a password", maxSeverity: "high", advisoryOnly: false }, { id: "OPS-PAT-001", area: "updates", title: "The OS is supported", maxSeverity: "high", advisoryOnly: false }],
    checks: [{ ruleId: "OPS-ACC-001", state: "fail", findings: [finding] }, { ruleId: "OPS-PAT-001", state: "unknown", reason: "permission_denied" }],
    summary: { score: 76, grade: "C", graded: true, incompleteReasons: [], deductions: 24, cap: 79, coverage: { weighted: 0.95, byArea: { access: { applicable: true, weighted: 1, checks: 1, completed: 1 }, updates: { applicable: true, weighted: 0.9, checks: 1, completed: 0 } } }, counts: { critical: 0, high: 1, medium: 0, low: 0, review: 0 } },
    scope: { privilege: "root", os: "linux", arch: "amd64", unknownRules: 0, droppedRules: 0 }, limitations: ["Read-only."], ...over,
});
const featureOff = () => new ApiRequestError(403, { code: "feature_disabled", message: "off" } as never);

beforeEach(() => vi.clearAllMocks());

describe("the row in the server's Security tab", () => {
    it("shows nothing at all when the check is not enabled", async () => {
        apiMock.getHostCheck.mockRejectedValue(featureOff());
        const { container } = wrap(<ServerCheckRow serverId="s1" />);
        await waitFor(() => expect(apiMock.getHostCheck).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 50));
        expect(container.textContent).toBe("");
    });
    it("offers Run check when nothing was run, and the grade with a View link when something was", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: null, report: null, diff: null });
        const first = wrap(<ServerCheckRow serverId="s1" />);
        expect(await screen.findByText("Not run yet")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Run check" })).toHaveAttribute("href", "/servers/s1/security-check");
        first.unmount();
        apiMock.getHostCheck.mockResolvedValue({ check: check(), report: report(), diff: null });
        wrap(<ServerCheckRow serverId="s1" />);
        expect(await screen.findByText(/Grade C/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View" })).toBeInTheDocument();
    });
    it("says Incomplete, never a grade, for a run that could not be graded; and Checking… while one runs", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: check({ graded: false, grade: null, score: null }), report: null, diff: null });
        const a = wrap(<ServerCheckRow serverId="s1" />);
        expect(await screen.findByText(/Incomplete/)).toBeInTheDocument();
        a.unmount();
        apiMock.getHostCheck.mockResolvedValue({ check: check({ status: "RUNNING", completedAt: null }), report: null, diff: null });
        wrap(<ServerCheckRow serverId="s1" />);
        expect(await screen.findByText("Checking…")).toBeInTheDocument();
    });
});

describe("the server check page", () => {
    const page = (online: boolean | null = true) => wrap(<ServerCheckPage serverId="s1" serverName="web-1" serverOnline={online} />);

    it("explains what it does and offers one primary action when nothing was run", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: null, report: null, diff: null });
        page();
        expect(await screen.findByText(/Reads this server's settings from the inside/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run check" })).toBeEnabled();
    });
    it("starts a check and shows live progress with the button off", async () => {
        apiMock.getHostCheck.mockResolvedValueOnce({ check: null, report: null, diff: null }).mockResolvedValue({ check: check({ status: "QUEUED", completedAt: null }), report: null, diff: null });
        apiMock.startHostCheck.mockResolvedValue({ check: check({ status: "QUEUED" }), existing: false });
        page();
        fireEvent.click(await screen.findByRole("button", { name: "Run check" }));
        await waitFor(() => expect(apiMock.startHostCheck).toHaveBeenCalled());
        expect(await screen.findByText("Checking the server…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Run/ })).toBeDisabled();
    });
    it("shows the report with the grade, the problem, what could not be checked and the comparison", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: check(), report: report(), diff: { entries: [{ change: "resolved", fingerprint: "x", ruleId: "OPS-PAT-001", title: "Pending security updates", severity: "medium" }], scoreBefore: 60, scoreAfter: 76, coverageBefore: 0.9, coverageAfter: 0.95, improvementClaimable: true, notes: [] } });
        apiMock.getHostCheckHistory.mockResolvedValue({ checks: [check()] });
        page();
        expect(await screen.findByText("Problems (1)")).toBeInTheDocument();
        expect(screen.getAllByText("SSH accepts passwords for root").length).toBeGreaterThan(0);
        expect(screen.getByText(/not a claim that the server is secure/)).toBeInTheDocument();
        expect(screen.getByText(/ran as root/)).toBeInTheDocument();
        expect(screen.getByText("Could not check (1)")).toBeInTheDocument();
        expect(screen.getByText("Fixed")).toBeInTheDocument();
        // The outside-check panel about the inside of a server does not belong here.
        expect(screen.queryByText("Not visible from outside")).toBeNull();
        expect(screen.getByText("Logins and access")).toBeInTheDocument();
    });
    it("says plainly when the run had no root, and gives no grade", async () => {
        apiMock.getHostCheck.mockResolvedValue({
            check: check({ graded: false, grade: null, score: null, privilege: "non-root" }),
            report: report({ scope: { privilege: "non-root", os: "linux", arch: "amd64", unknownRules: 0, droppedRules: 0 }, summary: { ...report().summary, graded: false, grade: null, score: null, incompleteReasons: ["weighted coverage 22% is below the 90% needed for a grade"] } }),
            diff: null,
        });
        page();
        expect(await screen.findByText("Incomplete")).toBeInTheDocument();
        expect(screen.getByText(/ran without root/)).toBeInTheDocument();
    });
    it("disables Run and says why when the agent is offline", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: null, report: null, diff: null });
        page(false);
        expect(await screen.findByText("The agent is offline")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run check" })).toBeDisabled();
        expect(screen.getByText(/Bring the agent online/)).toBeInTheDocument();
    });
    it("replaces Run with Update agent when the agent is too old, using the server's own words", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: null, report: null, diff: null });
        apiMock.startHostCheck.mockRejectedValue(new ApiRequestError(409, { code: "agent_too_old", message: "The agent on this server is too old for the server check. Update it to version 2.0.38 or newer.", requiredVersion: "2.0.38" } as never));
        page();
        fireEvent.click(await screen.findByRole("button", { name: "Run check" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("2.0.38");
        expect(screen.getByRole("link", { name: "Update agent" })).toHaveAttribute("href", "/servers/s1");
        expect(screen.queryByRole("button", { name: "Run check" })).toBeNull();
    });
    it("shows the reason a check failed, keeping the same layout", async () => {
        apiMock.getHostCheck.mockResolvedValue({ check: check({ status: "FAILED", completedAt: null, graded: false, grade: null, score: null, errorMessage: "The agent did not answer in time. Try again." }), report: null, diff: null });
        apiMock.getHostCheckHistory.mockResolvedValue({ checks: [] });
        page();
        expect(await screen.findByText("The agent did not answer in time. Try again.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
    });
    it("is a quiet notice, not an error, when the check is not enabled", async () => {
        apiMock.getHostCheck.mockRejectedValue(featureOff());
        page();
        expect(await screen.findByText(/isn't turned on for your organization yet/)).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });
    it("lets people open an earlier check", async () => {
        const earlier = check({ id: "c0", completedAt: new Date(Date.now() - 86_400_000).toISOString(), grade: "B", score: 85 });
        apiMock.getHostCheck.mockResolvedValue({ check: check(), report: report(), diff: null });
        apiMock.getHostCheckHistory.mockResolvedValue({ checks: [check(), earlier] });
        apiMock.getHostCheckById.mockResolvedValue({ check: earlier, report: report({ summary: { ...report().summary, grade: "B", score: 85 } }), diff: null });
        page();
        const section = (await screen.findByText("Earlier checks")).closest("section") as HTMLElement;
        fireEvent.click(within(section).getByRole("button", { name: "View" }));
        await waitFor(() => expect(apiMock.getHostCheckById).toHaveBeenCalledWith("s1", "c0"));
    });
});
