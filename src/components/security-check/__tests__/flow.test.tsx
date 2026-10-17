import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finding, report, scan, target } from "./fixtures";

const apiMock = vi.hoisted(() => ({
    getSecurityCheck: vi.fn(),
    addSecurityCheckDomain: vi.fn(),
    getSecurityCheckTarget: vi.fn(),
    verifySecurityCheckDomain: vi.fn(),
    removeSecurityCheckDomain: vi.fn(),
    startSecurityCheck: vi.fn(),
    getSecurityCheckScans: vi.fn(),
    getSecurityCheckScan: vi.fn(),
    getStressTest: vi.fn(),
    startStressTest: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: apiMock }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { ApiRequestError } from "@/lib/api";
import { DomainStep } from "../domain-step";
import { ReportView } from "../report-view";
import { ResultsStep } from "../results-step";
import { StepIndicator } from "../steps";
import { VerifyStep } from "../verify-step";

const wrap = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
const apiError = (status: number, message: string, code = "x") => new ApiRequestError(status, { message, code } as never);

beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getSecurityCheck.mockResolvedValue({ usage: { used: 3, limit: 20, resetsAt: "" }, stressUsage: { used: 0, limit: 10, resetsAt: "" }, targets: [] });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("step indicator", () => {
    it("marks the current step and completed steps", () => {
        render(<StepIndicator current={2} />);
        expect(screen.getByRole("list", { name: "Progress" })).toBeInTheDocument();
        expect(screen.getByText("Verify").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Domain").closest("li")).not.toHaveAttribute("aria-current");
    });
});

describe("step 1: add a domain", () => {
    it("keeps Continue off until something is typed, then adds the domain and opens it", async () => {
        apiMock.addSecurityCheckDomain.mockResolvedValue({ target: target() });
        const onOpen = vi.fn();
        wrap(<DomainStep targets={[]} onOpen={onOpen} />);
        const button = screen.getByRole("button", { name: "Continue" });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "  Example.com " } });
        expect(button).toBeEnabled();
        fireEvent.click(button);
        await waitFor(() => expect(onOpen).toHaveBeenCalledWith("t1"));
        expect(apiMock.addSecurityCheckDomain).toHaveBeenCalledWith("Example.com");
    });
    it("shows the reason the API gives for a domain it refuses, and stays put", async () => {
        apiMock.addSecurityCheckDomain.mockRejectedValue(apiError(400, "Private and reserved domains cannot be scanned.", "invalid_domain"));
        const onOpen = vi.fn();
        wrap(<DomainStep targets={[]} onOpen={onOpen} />);
        fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "localhost" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Private and reserved domains cannot be scanned.");
        expect(screen.getByLabelText("Domain")).toHaveAttribute("aria-invalid", "true");
        expect(onOpen).not.toHaveBeenCalled();
    });
    it("lists existing domains with what is true about each", () => {
        const onOpen = vi.fn();
        wrap(
            <DomainStep
                onOpen={onOpen}
                targets={[
                    target({ id: "a", hostname: "a.com" }),
                    target({ id: "b", hostname: "b.com", verified: true, latest: scan({ id: "s", hostname: "b.com", grade: "B", graded: true }) }),
                    target({ id: "c", hostname: "c.com", verified: true, latest: scan({ status: "RUNNING", completedAt: null }) }),
                    target({ id: "d", hostname: "d.com", verified: true, latest: scan({ graded: false, grade: null }) }),
                    target({ id: "e", hostname: "e.com", verified: true, latest: scan({ status: "FAILED", completedAt: null }) }),
                ]}
            />,
        );
        expect(screen.getByText("Needs verification")).toBeInTheDocument();
        expect(screen.getByText(/^Grade B/)).toBeInTheDocument();
        expect(screen.getByText("Checking now")).toBeInTheDocument();
        expect(screen.getByText(/^Incomplete/)).toBeInTheDocument();
        expect(screen.getByText("Last check didn't finish")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Open b.com" }));
        expect(onOpen).toHaveBeenCalledWith("b");
    });
});

describe("step 2: prove ownership", () => {
    it("shows the record to add and copies each value", async () => {
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        expect(screen.getByText("_opslin-verify.example.com")).toBeInTheDocument();
        expect(screen.getByText(`opslin-verify=${"a".repeat(32)}`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Copy name" }));
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("_opslin-verify.example.com"));
        fireEvent.click(screen.getByRole("button", { name: "Copy value" }));
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`opslin-verify=${"a".repeat(32)}`));
    });
    it("still copies when the browser refuses the clipboard API", async () => {
        const original = navigator.clipboard.writeText;
        (navigator.clipboard.writeText as ReturnType<typeof vi.fn>) = vi.fn().mockRejectedValue(new Error("denied"));
        const exec = vi.fn().mockReturnValue(true);
        (document as unknown as { execCommand: unknown }).execCommand = exec;
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Copy value" }));
        await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
        expect(screen.queryByText(/Couldn't copy/)).toBeNull();
        navigator.clipboard.writeText = original;
    });
    it("tells people whose DNS host appends the domain to use the short name", () => {
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        expect(screen.getByText(/enter only _opslin-verify as the name/)).toBeInTheDocument();
    });
    it("labels the file-check reason so it is not mistaken for the DNS result", async () => {
        apiMock.verifySecurityCheckDomain.mockResolvedValue({ verified: false, dns: "No TXT record was found yet.", http: "The site did not answer.", target: target() });
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Check now" }));
        expect(await screen.findByRole("status")).toHaveTextContent("No TXT record was found yet. File check: The site did not answer.");
    });
    it("keeps the file option behind a disclosure", () => {
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        const summary = screen.getByText("Use a file on your website instead");
        expect(summary.closest("details")).not.toHaveAttribute("open");
    });
    it("explains what is missing when the proof is not found yet", async () => {
        apiMock.verifySecurityCheckDomain.mockResolvedValue({ verified: false, dns: "No TXT record was found yet. DNS changes can take a few minutes.", http: "The site did not answer.", target: target() });
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Check now" }));
        expect(await screen.findByRole("status")).toHaveTextContent("No TXT record was found yet");
        expect(apiMock.verifySecurityCheckDomain).toHaveBeenCalledWith("t1");
    });
    it("shows a rate-limit message from the API", async () => {
        apiMock.verifySecurityCheckDomain.mockRejectedValue(apiError(429, "Please wait 8 seconds before checking again.", "verify_rate_limited"));
        wrap(<VerifyStep target={target()} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Check now" }));
        expect(await screen.findByRole("status")).toHaveTextContent("Please wait 8 seconds");
    });
    it("removes a domain added by mistake and goes back", async () => {
        apiMock.removeSecurityCheckDomain.mockResolvedValue({ removed: true });
        const onBack = vi.fn();
        wrap(<VerifyStep target={target()} onBack={onBack} />);
        fireEvent.click(screen.getByRole("button", { name: "Remove domain" }));
        await waitFor(() => expect(onBack).toHaveBeenCalled());
    });
});

describe("step 3: results", () => {
    const usage = { used: 3, limit: 20, resetsAt: "2026-11-01T00:00:00.000Z" };
    const verifiedTarget = (over = {}) => target({ verified: true, challenge: null, verifyMethod: "dns", verifiedUntil: "2026-10-15T10:00:00.000Z", ...over });

    it("runs a first check and says so while it works, without changing the layout", async () => {
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.startSecurityCheck.mockResolvedValue({ scan: scan({ status: "QUEUED" }), usage });
        wrap(<ResultsStep target={verifiedTarget()} usage={usage} />);
        fireEvent.click(screen.getByRole("button", { name: "Run check" }));
        await waitFor(() => expect(apiMock.startSecurityCheck).toHaveBeenCalledWith("t1", true));
    });
    it("asks for the stress test together with the check unless the person unticks it", async () => {
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.startSecurityCheck.mockResolvedValue({ scan: scan({ status: "QUEUED" }), usage });
        wrap(<ResultsStep target={verifiedTarget()} usage={usage} />);
        const box = screen.getByRole("checkbox", { name: /Also test how much traffic the site can handle/ });
        expect(box).toBeChecked();
        fireEvent.click(box);
        fireEvent.click(screen.getByRole("button", { name: "Run check" }));
        await waitFor(() => expect(apiMock.startSecurityCheck).toHaveBeenCalledWith("t1", false));
    });
    it("unticks and disables the stress option, and says why, when the month's stress tests are used", async () => {
        apiMock.getSecurityCheck.mockResolvedValue({ usage, stressUsage: { used: 10, limit: 10, resetsAt: "" }, targets: [] });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.startSecurityCheck.mockResolvedValue({ scan: scan({ status: "QUEUED" }), usage });
        wrap(<ResultsStep target={verifiedTarget()} usage={usage} />);
        expect(await screen.findByText(/used all your stress tests for this month/)).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Run check" }));
        await waitFor(() => expect(apiMock.startSecurityCheck).toHaveBeenCalledWith("t1", false));
    });
    it("shows the stress test inside the report, right after the grade, and says when it was not run", async () => {
        const done = scan({ progress: { phase: "done", done: 1, total: 1, includeStress: true, stress: { started: false, reason: "This domain was stress-tested a moment ago." } } });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [done] });
        apiMock.getSecurityCheckScan.mockResolvedValue({ scan: done, report: report(), diff: null });
        wrap(<ResultsStep target={verifiedTarget({ latest: done })} usage={usage} />);
        const doFirst = await screen.findByText("Do these first");
        const stress = screen.getByText("How much traffic can this site handle?");
        // The stress panel comes before the list of problems: grade, stress, then details.
        expect(stress.compareDocumentPosition(doFirst) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText(/The stress test was not run: This domain was stress-tested a moment ago/)).toBeInTheDocument();
    });
    it("says the stress test starts after the checks while they run", async () => {
        const running = scan({ status: "RUNNING", completedAt: null, progress: { phase: "probes", done: 3, total: 34, includeStress: true } });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.getSecurityCheckScan.mockResolvedValue({ scan: running, report: null, diff: null });
        wrap(<ResultsStep target={verifiedTarget({ latest: running })} usage={usage} />);
        expect(await screen.findByText("Starts after the checks…")).toBeInTheDocument();
    });
    it("shows live progress for a running check and blocks a second start", async () => {
        const running = scan({ status: "RUNNING", completedAt: null, progress: { phase: "probes", done: 12, total: 34 } });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.getSecurityCheckScan.mockResolvedValue({ scan: running, report: null, diff: null });
        wrap(<ResultsStep target={verifiedTarget({ latest: running })} usage={usage} />);
        expect(await screen.findByText("Looking for exposed files (12 of 34)")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Run again/ })).toBeDisabled();
    });
    it("loads and shows the report of the latest finished check", async () => {
        const done = scan();
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [done] });
        apiMock.getSecurityCheckScan.mockResolvedValue({ scan: done, report: report(), diff: null });
        wrap(<ResultsStep target={verifiedTarget({ latest: done })} usage={usage} />);
        expect(await screen.findByLabelText("Grade D")).toBeInTheDocument();
        expect(screen.getByText("Problems (1)")).toBeInTheDocument();
    });
    it("disables Run when the monthly allowance is used up and says why", () => {
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        wrap(<ResultsStep target={verifiedTarget()} usage={{ ...usage, used: 20 }} />);
        expect(screen.getByRole("button", { name: "Run check" })).toBeDisabled();
        expect(screen.getByText("You have used all 20 checks for this month.")).toBeInTheDocument();
    });
    it("shows the API's reason when a check is refused", async () => {
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.startSecurityCheck.mockRejectedValue(apiError(429, "This domain was checked a moment ago. You can run it again in 90 seconds.", "cooldown"));
        wrap(<ResultsStep target={verifiedTarget()} usage={usage} />);
        fireEvent.click(screen.getByRole("button", { name: "Run check" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("checked a moment ago");
    });
    it("tells the person when the last check failed, with the reason", async () => {
        const failed = scan({ status: "FAILED", completedAt: null, errorMessage: "example.com did not answer over HTTP or HTTPS (ECONNREFUSED)." });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [] });
        apiMock.getSecurityCheckScan.mockResolvedValue({ scan: failed, report: null, diff: null });
        wrap(<ResultsStep target={verifiedTarget({ latest: failed })} usage={usage} />);
        expect(await screen.findByRole("status")).toHaveTextContent("did not answer over HTTP or HTTPS");
    });
    it("lets the person open an earlier check", async () => {
        const newer = scan({ id: "new", grade: "B" });
        const older = scan({ id: "old", grade: "D", completedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
        apiMock.getSecurityCheckScans.mockResolvedValue({ scans: [newer, older] });
        apiMock.getSecurityCheckScan.mockImplementation(async (id: string) => ({ scan: id === "new" ? newer : older, report: report({}, { grade: id === "new" ? "B" : "D" }), diff: null }));
        wrap(<ResultsStep target={verifiedTarget({ latest: newer })} usage={usage} />);
        expect(await screen.findByLabelText("Grade B")).toBeInTheDocument();
        const rows = await screen.findAllByRole("button", { name: /View|Showing/ });
        fireEvent.click(rows.find((b) => b.textContent === "View")!);
        expect(await screen.findByLabelText("Grade D")).toBeInTheDocument();
    });
});

describe("the report", () => {
    it("opens a problem to show what was seen, why, how to fix and how to verify", () => {
        render(<ReportView report={report()} diff={null} completedAt={new Date().toISOString()} />);
        const row = screen.getByText("/.env can be downloaded by anyone", { selector: "summary span" }).closest("details")!;
        expect(row).not.toHaveAttribute("open");
        for (const text of ["Seen", "Why it matters", "Fix", "Verify", "Not tested"]) expect(within(row).getByText(text)).toBeInTheDocument();
        expect(within(row).getByText(/rotate every secret/)).toBeInTheDocument();
        expect(within(row).getByText(/OPS-WEB-001 · high confidence/)).toBeInTheDocument();
    });
    it("makes the grade the focal element and never calls the site secure", () => {
        render(<ReportView report={report({}, { grade: "B", score: 88 })} diff={null} completedAt={null} />);
        expect(screen.getByLabelText("Grade B")).toBeInTheDocument();
        expect(screen.getByText("88 / 100")).toBeInTheDocument();
        expect(screen.getByText(/not a claim that the site is secure/)).toBeInTheDocument();
        // What a check from outside cannot see is listed as not tested, never as passed.
        expect(screen.getByText("Not visible from outside")).toBeInTheDocument();
        expect(within(screen.getByText("Not visible from outside").closest("section") as HTMLElement).getAllByText("Not tested")).toHaveLength(6);
        expect(screen.getByText("Login and SSH settings")).toBeInTheDocument();
    });
    it("shows Incomplete with the reasons behind a disclosure, and no grade", () => {
        const incomplete = report({}, { graded: false, grade: null, score: null, incompleteReasons: ["critical-impact check OPS-WEB-001 did not complete"], coverage: { weighted: 0.4, byArea: {} } });
        render(<ReportView report={incomplete} diff={null} completedAt={null} />);
        expect(screen.getByText("Incomplete")).toBeInTheDocument();
        expect(screen.queryByLabelText(/^Grade /)).toBeNull();
        expect(screen.getByText("Why there is no grade").closest("details")).not.toHaveAttribute("open");
        expect(screen.getByText(/OPS-WEB-001 did not complete/)).toBeInTheDocument();
    });
    it("lists what could not be checked in plain words", () => {
        render(<ReportView report={report()} diff={null} completedAt={null} />);
        expect(screen.getByText("Could not check (1)")).toBeInTheDocument();
        expect(screen.getByText("the site did not answer in time")).toBeInTheDocument();
    });
    it("shows what changed since the last check", () => {
        const diff = { scoreBefore: 50, scoreAfter: 64, improvementClaimable: true, notes: ["This run checked less than the previous one, so no improvement is claimed."], entries: [{ change: "resolved" as const, fingerprint: "x", ruleId: "R", title: "An old problem", severity: "high" as const }, { change: "new" as const, fingerprint: "y", ruleId: "R2", title: "A new problem", severity: "low" as const }] };
        render(<ReportView report={report()} diff={diff} completedAt={null} />);
        expect(screen.getByText("Since the last check")).toBeInTheDocument();
        expect(screen.getByText("Fixed")).toBeInTheDocument();
        expect(screen.getByText("New")).toBeInTheDocument();
        expect(screen.getByText(/no improvement is claimed/)).toBeInTheDocument();
    });
    it("shows coverage per area, skipping areas that do not apply, and the limits collapsed", () => {
        render(<ReportView report={report()} diff={null} completedAt={null} />);
        expect(screen.getByText("Website exposure")).toBeInTheDocument();
        expect(screen.getByText("HTTPS and certificates")).toBeInTheDocument();
        expect(screen.queryByText("Open ports")).toBeNull();
        expect(screen.getByText("Limits of this check").closest("details")).not.toHaveAttribute("open");
    });
    it("tells the person when their site blocked the check, with the exact fix", () => {
        const blocked = report({ scope: { requests: 6, pagesCrawled: 0, crawlTruncated: false, stoppedByBudget: false, stoppedByDeadline: false, portsChecked: false, blockedByTarget: 403 } }, { graded: false, grade: null, score: null, coverage: { weighted: 0.3, byArea: {} } });
        render(<ReportView report={blocked} diff={null} completedAt={null} />);
        const notice = screen.getByText("Your site blocked this check").closest("[role=status]")!;
        expect(notice).toHaveTextContent("status 403");
        expect(notice).toHaveTextContent("OpslinSecurityCheck");
        expect(screen.getByText("Incomplete")).toBeInTheDocument();
    });
    it("shows no block notice for a normal report", () => {
        render(<ReportView report={report()} diff={null} completedAt={null} />);
        expect(screen.queryByText("Your site blocked this check")).toBeNull();
    });
    it("does not reassure when nothing was found but little could be checked", () => {
        const empty = report({ checks: [{ ruleId: "OPS-WEB-001", state: "unknown", reason: "timeout" }] }, { graded: false, grade: null, score: null, coverage: { weighted: 0.1, byArea: {} }, counts: { critical: 0, high: 0, medium: 0, low: 0, review: 0 } });
        render(<ReportView report={empty} diff={null} completedAt={null} />);
        expect(screen.getByText(/too little to say anything/)).toBeInTheDocument();
        expect(screen.queryByText("No problems were found in the checks that completed.")).toBeNull();
    });
    it("lists the top three fixes first, most severe first", () => {
        const many = report({
            checks: [{ ruleId: "R", state: "fail", findings: ["one", "two", "three", "four"].map((t, i) => finding({ fingerprint: t, title: t, severity: (["low", "high", "critical", "medium"] as const)[i] })) }],
        });
        render(<ReportView report={many} diff={null} completedAt={null} />);
        const section = screen.getByText("Do these first").closest("section")!;
        expect(within(section).getAllByText(/^(one|two|three|four)$/).map((n) => n.textContent)).toEqual(["three", "two", "four"]);
    });
});
