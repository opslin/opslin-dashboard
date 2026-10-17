import type { SecurityCheckFinding, SecurityCheckOutcome, SecurityCheckSeverity, SecurityCheckReportBase as SecurityCheckReport } from "@/lib/api";

/** Plain words for why a check could not run (never the machine code). */
export function reasonText(reason: string | undefined): string {
    switch (reason) {
        case "permission_denied":
            return "needs more access";
        case "tool_missing":
            return "a needed tool is missing";
        case "timeout":
            return "the site did not answer in time";
        case "scope_denied":
            return "outside the domain you verified";
        case "unsupported":
            return "this scanner cannot test it";
        case "stale_intelligence":
            return "reference data too old";
        case "parse_error":
            return "the answer could not be understood";
        case "budget_exhausted":
            return "stopped by the request limit";
        case "blocked":
            return "blocked by the site";
        case "worker_failed":
            return "the check failed";
        default:
            return "could not be decided";
    }
}

export const SEVERITY_LABEL: Record<SecurityCheckSeverity, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
};

/** Colour classes for a severity chip, using the design-system status tokens. */
export function severityClass(severity: SecurityCheckSeverity): string {
    switch (severity) {
        case "critical":
        case "high":
            return "bg-destructive/10 text-destructive";
        case "medium":
            return "bg-warning-muted text-warning-text";
        case "low":
            return "bg-info-muted text-info-text";
        default:
            return "bg-muted text-muted-foreground";
    }
}

export function gradeClass(grade: string | null): string {
    switch (grade) {
        case "A":
        case "B":
            return "text-success-text";
        case "C":
            return "text-warning-text";
        case "D":
        case "F":
            return "text-destructive";
        default:
            return "text-muted-foreground";
    }
}

const RANK: Record<SecurityCheckSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function failingFindings(report: SecurityCheckReport): SecurityCheckFinding[] {
    return report.checks
        .flatMap((c) => c.findings ?? [])
        .filter((f) => f.state === "fail")
        .sort((a, b) => RANK[b.severity] - RANK[a.severity] || (a.fingerprint < b.fingerprint ? -1 : 1));
}

export function reviewFindings(report: SecurityCheckReport): SecurityCheckFinding[] {
    return report.checks
        .flatMap((c) => c.findings ?? [])
        .filter((f) => f.state === "warn")
        .sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1));
}

export function unknownChecks(report: SecurityCheckReport): Array<SecurityCheckOutcome & { title: string }> {
    return report.checks
        .filter((c) => c.state === "unknown")
        .map((c) => ({ ...c, title: report.manifest.find((m) => m.id === c.ruleId)?.title ?? c.ruleId }));
}

export function passedCount(report: SecurityCheckReport): number {
    return report.checks.filter((c) => c.state === "pass").length;
}

const AREA_LABEL: Record<string, string> = {
    dns: "Domain and email records",
    tls: "HTTPS and certificates",
    web: "Website exposure",
    links: "Pages and links",
    ports: "Open ports",
    // server check
    exposure: "Open ports and services",
    access: "Logins and access",
    updates: "Updates and patches",
    firewall: "Firewall",
    docker: "Containers",
    data: "Files and secrets",
    signals: "Signs of a break-in",
};

export function areaLabel(area: string): string {
    return AREA_LABEL[area] ?? area;
}

/** The sentence shown when no problem was found. It never reassures when most checks could not run. */
export function cleanMessage(report: SecurityCheckReport, noun: "site" | "server" = "site"): string {
    const c = report.summary.coverage.weighted;
    if (c < 0.5) return `No problems were found, but only ${Math.round(c * 100)}% of the checks could run. That is too little to say anything about this ${noun}.`;
    if (!report.summary.graded) return "No problems were found in the checks that completed, but some checks could not run.";
    return "No problems were found in the checks that completed.";
}

export function progressLabel(progress: { phase: string; done: number; total: number } | null | undefined): string {
    if (!progress) return "Starting";
    const names: Record<string, string> = {
        queued: "Starting",
        dns: "Reading the domain's DNS records",
        http: "Opening the site",
        tls: "Checking the certificate",
        probes: "Looking for exposed files",
        crawl: "Reading pages and links",
        ports: "Checking ports",
        done: "Finishing",
        failed: "Stopped",
    };
    const name = names[progress.phase] ?? "Working";
    return progress.total > 1 && progress.phase !== "queued" ? `${name} (${Math.min(progress.done, progress.total)} of ${progress.total})` : name;
}

/** Plain label for one stress stage. */
export function stressStageLabel(stage: { label: "baseline" | "step" | "recovery"; rps: number }): string {
    if (stage.label === "baseline") return "Quiet start (1 per second)";
    if (stage.label === "recovery") return "After the traffic (1 per second)";
    return `${stage.rps} requests per second`;
}

export function stressStateText(state: "pass" | "degraded" | "fail" | "limited" | "skipped"): string {
    switch (state) {
        case "pass":
            return "Fine";
        case "degraded":
            return "Much slower";
        case "fail":
            return "Failing";
        case "limited":
            return "Refused requests";
        default:
            return "Not run";
    }
}

export function stressStateClass(state: "pass" | "degraded" | "fail" | "limited" | "skipped"): string {
    switch (state) {
        case "pass":
            return "text-success-text";
        case "degraded":
        case "limited":
            return "text-warning-text";
        case "fail":
            return "text-destructive";
        default:
            return "text-muted-foreground";
    }
}

export function stressProgressLabel(progress: { phase: string } | null | undefined): string {
    if (!progress) return "Starting…";
    if (progress.phase === "queued") return "Waiting to start…";
    if (progress.phase === "starting") return "Checking the site first…";
    if (progress.phase === "recovery") return "Checking that the site recovers…";
    if (progress.phase === "done") return "Finishing…";
    return `Sending ${progress.phase}…`;
}

/** What a check from outside cannot see: only a check run on the server itself can. Shown as "not tested", never as a pass. */
export const INSIDE_SERVER_AREAS: ReadonlyArray<{ label: string; detail: string }> = [
    { label: "Login and SSH settings", detail: "Password logins, root access, brute-force protection" },
    { label: "Firewall and open ports", detail: "Which services listen, and what the firewall allows" },
    { label: "Operating system updates", detail: "Missing security patches and old software" },
    { label: "Containers and databases", detail: "Docker settings, databases reachable from the internet" },
    { label: "Files and secrets on disk", detail: "Readable keys, .env files, risky permissions" },
    { label: "Signs of a break-in", detail: "Unexpected programs, scheduled jobs and logins" },
];
