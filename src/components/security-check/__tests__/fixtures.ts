import type { SecurityCheckReport, SecurityCheckScanSummary, SecurityCheckTarget } from "@/lib/api";

export const finding = (over: Partial<SecurityCheckReport["checks"][number]["findings"] extends (infer F)[] | undefined ? F : never> = {}) => ({
    ruleId: "OPS-WEB-001",
    fingerprint: "f1",
    rootCause: "env-file-exposed",
    asset: "/.env",
    area: "web",
    state: "fail" as const,
    severity: "critical" as const,
    confidence: "high" as const,
    title: "/.env can be downloaded by anyone",
    observation: "A request for /.env returned a file that looks like an environment file.",
    why: "Environment files normally hold database passwords.",
    fix: "Block the file in your web server and rotate every secret in it.",
    verify: "Open https://example.com/.env; it should return 404.",
    untested: "The file's contents were not read or stored.",
    ...over,
});

export function report(over: Partial<SecurityCheckReport> = {}, summary: Partial<SecurityCheckReport["summary"]> = {}): SecurityCheckReport {
    return {
        schema: "opslin.domain-scan.report/1",
        generatedAt: "2026-10-14T12:00:00.000Z",
        target: { hostname: "example.com", addresses: ["93.184.216.34"], scheme: "https" },
        manifest: [
            { id: "OPS-WEB-001", area: "web", title: "Environment files are not downloadable", maxSeverity: "critical", advisoryOnly: false },
            { id: "OPS-WEB-007", area: "web", title: "Basic security headers are set", maxSeverity: "low", advisoryOnly: false },
            { id: "OPS-WEB-012", area: "web", title: "A security.txt file tells researchers how to reach you", maxSeverity: "info", advisoryOnly: true },
            { id: "OPS-DOM-002", area: "tls", title: "The HTTPS certificate is valid", maxSeverity: "high", advisoryOnly: false },
        ],
        checks: [
            { ruleId: "OPS-WEB-001", state: "fail", findings: [finding()] },
            { ruleId: "OPS-WEB-007", state: "pass" },
            { ruleId: "OPS-WEB-012", state: "unknown", reason: "timeout" },
            { ruleId: "OPS-DOM-002", state: "pass" },
        ],
        summary: {
            score: 64,
            grade: "D",
            graded: true,
            incompleteReasons: [],
            deductions: 30,
            cap: 64,
            coverage: { weighted: 0.96, byArea: { web: { applicable: true, weighted: 0.95, checks: 3, completed: 2 }, tls: { applicable: true, weighted: 1, checks: 1, completed: 1 }, ports: { applicable: false, weighted: 0, checks: 0, completed: 0 } } },
            counts: { critical: 1, high: 0, medium: 0, low: 0, review: 1 },
            ...summary,
        },
        scope: { requests: 53, pagesCrawled: 7, crawlTruncated: false, stoppedByBudget: false, stoppedByDeadline: false, portsChecked: false, blockedByTarget: null },
        limitations: ["This is an outside-in check: it sees what any visitor on the internet can see."],
        ...over,
    };
}

export const scan = (over: Partial<SecurityCheckScanSummary> = {}): SecurityCheckScanSummary => ({
    id: "scan-1", targetId: "t1", hostname: "example.com", status: "COMPLETED", progress: null,
    startedAt: "2026-10-14T11:59:00.000Z", completedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    score: 64, grade: "D", graded: true, coverage: 0.96, counts: { critical: 1, high: 0, medium: 0, low: 0, review: 1 },
    requestCount: 53, errorMessage: null, createdAt: new Date(Date.now() - 6 * 60_000).toISOString(), ...over,
});

export const target = (over: Partial<SecurityCheckTarget> = {}): SecurityCheckTarget => ({
    id: "t1", hostname: "example.com", verified: false, verifyMethod: null, verifiedUntil: null, lastVerifyError: null,
    challenge: {
        token: "a".repeat(32),
        dns: { type: "TXT", name: "_opslin-verify.example.com", value: `opslin-verify=${"a".repeat(32)}` },
        http: { url: `http://example.com/.well-known/opslin-verify/${"a".repeat(32)}`, path: `/.well-known/opslin-verify/${"a".repeat(32)}`, body: "a".repeat(32) },
    },
    createdAt: "2026-10-14T10:00:00.000Z", latest: null, ...over,
});
