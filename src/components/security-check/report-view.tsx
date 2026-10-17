"use client";

import { ChevronRight } from "lucide-react";
import { Disclosure, Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "./rows";
import type { HostCheckReport, SecurityCheckDiff, SecurityCheckFinding, SecurityCheckReport } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { INSIDE_SERVER_AREAS, SEVERITY_LABEL, areaLabel, cleanMessage, failingFindings, gradeClass, passedCount, reasonText, reviewFindings, severityClass, unknownChecks } from "./format";

function SeverityChip({ severity }: { severity: SecurityCheckFinding["severity"] }) {
    return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", severityClass(severity))}>{SEVERITY_LABEL[severity]}</span>;
}

/** One problem: the title and severity in the row, the detail behind a disclosure (DESIGN.md S3). */
function FindingRow({ finding }: { finding: SecurityCheckFinding }) {
    const rows: Array<[string, string | undefined]> = [
        ["Seen", finding.observation],
        ["Why it matters", finding.why],
        ["Fix", finding.fix],
        ["Verify", finding.verify],
        ["Not tested", finding.untested],
    ];
    return (
        <details className="group border-t border-border/70 first:border-t-0">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-2.5 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none group-open:rotate-90" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{finding.title}</span>
                {finding.state === "fail" ? <SeverityChip severity={finding.severity} /> : <span className="text-xs text-muted-foreground">To review</span>}
            </summary>
            <dl className="grid gap-x-4 gap-y-2 px-5 pb-4 pl-12 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                {rows.map(([label, text]) =>
                    text ? (
                        <div key={label} className="contents">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="min-w-0 break-words text-foreground">{text}</dd>
                        </div>
                    ) : null,
                )}
                <div className="contents">
                    <dt className="text-muted-foreground">Check</dt>
                    <dd className="text-xs text-muted-foreground">
                        {finding.ruleId} · {finding.confidence} confidence
                    </dd>
                </div>
            </dl>
        </details>
    );
}

const CHANGE_LABEL: Record<SecurityCheckDiff["entries"][number]["change"], string> = {
    new: "New",
    persisting: "Still there",
    resolved: "Fixed",
    not_rechecked: "Not rechecked",
};

export function ReportView({ report, diff, completedAt, variant = "domain", afterSummary }: { report: SecurityCheckReport | HostCheckReport; diff: SecurityCheckDiff | null; completedAt: string | null; variant?: "domain" | "server"; afterSummary?: React.ReactNode }) {
    const server = variant === "server";
    const domainScope = "pagesCrawled" in report.scope ? report.scope : null;
    const { summary } = report;
    const problems = failingFindings(report);
    const review = reviewFindings(report);
    const unknown = unknownChecks(report);
    const next = problems.filter((f) => f.confidence !== "low").slice(0, 3);
    const areas = Object.entries(summary.coverage.byArea);

    return (
        <div className="space-y-4">
            {domainScope?.blockedByTarget ? (
                <Panel>
                    <Section>
                        <div role="status" className="px-5 py-4">
                            <p className="text-sm font-medium text-foreground">Your site blocked this check</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                It answered the home page with status {domainScope.blockedByTarget}, which usually means a firewall or bot protection. Allow requests whose user agent contains
                                {" "}<code className="font-mono text-xs text-foreground">OpslinSecurityCheck</code>, or pause bot protection for a few minutes, then run the check again.
                            </p>
                        </div>
                    </Section>
                </Panel>
            ) : null}
            <Panel>
                <Section>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-5">
                        {summary.graded && summary.grade ? (
                            <>
                                <span className={cn("text-6xl font-semibold leading-none tracking-tight", gradeClass(summary.grade))} aria-label={`Grade ${summary.grade}`}>
                                    {summary.grade}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-lg font-medium text-foreground">{summary.score} / 100</p>
                                    <p className="text-sm text-muted-foreground">{server ? "Covers the settings the check could read on this server. It is not a claim that the server is secure." : "Covers the checks that can be run from outside. It is not a claim that the site is secure."}</p>
                                </div>
                            </>
                        ) : (
                            <div className="min-w-0">
                                <p className="text-2xl font-semibold text-foreground">Incomplete</p>
                                <p className="text-sm text-muted-foreground">Too little could be checked to give this site a grade.</p>
                            </div>
                        )}
                    </div>
                    <Row
                        label={<span className="text-sm font-normal text-muted-foreground">{completedAt ? `Checked ${formatRelativeTime(completedAt)}` : "Checked"}</span>}
                        state={server ? `${Math.round(summary.coverage.weighted * 100)}% of checks completed${"privilege" in report.scope ? ` · ran ${report.scope.privilege === "root" ? "as root" : "without root"}` : ""}` : `${Math.round(summary.coverage.weighted * 100)}% of checks completed · ${domainScope?.pagesCrawled ?? 0} ${domainScope?.pagesCrawled === 1 ? "page" : "pages"} read`}
                    />
                </Section>
                {!summary.graded && summary.incompleteReasons.length > 0 ? (
                    <Disclosure label="Why there is no grade">
                        <ul className="space-y-1 px-5 pb-4 pl-12 text-sm text-muted-foreground">
                            {summary.incompleteReasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                            ))}
                        </ul>
                    </Disclosure>
                ) : null}
            </Panel>

            {afterSummary}

            {next.length > 0 ? (
                <Panel>
                    <Section label="Do these first">
                        {next.map((f, index) => (
                            <Row key={f.fingerprint} leading={<span className="text-sm text-muted-foreground">{index + 1}</span>} label={f.title} state={<SeverityChip severity={f.severity} />} />
                        ))}
                    </Section>
                </Panel>
            ) : null}

            <Panel>
                <Section label={`Problems (${problems.length})`}>
                    {problems.length === 0 ? <p className="px-5 py-3 text-sm text-muted-foreground">{cleanMessage(report, server ? "server" : "site")}</p> : problems.map((f) => <FindingRow key={f.fingerprint} finding={f} />)}
                </Section>
            </Panel>

            {review.length > 0 ? (
                <Panel>
                    <Section label={`To review, not scored (${review.length})`}>
                        {review.map((f) => (
                            <FindingRow key={f.fingerprint} finding={f} />
                        ))}
                    </Section>
                </Panel>
            ) : null}

            {unknown.length > 0 ? (
                <Panel>
                    <Section label={`Could not check (${unknown.length})`}>
                        {unknown.map((c) => (
                            <Row key={c.ruleId} label={c.title} state={reasonText(c.reason)} />
                        ))}
                    </Section>
                </Panel>
            ) : null}

            {diff && diff.entries.length + diff.notes.length > 0 ? (
                <Panel>
                    <Section label="Since the last check">
                        {diff.notes.map((note) => (
                            <p key={note} className="px-5 py-3 text-sm text-muted-foreground">
                                {note}
                            </p>
                        ))}
                        {diff.entries.map((e) => (
                            <Row key={`${e.change}-${e.fingerprint}`} label={e.title} state={CHANGE_LABEL[e.change]} />
                        ))}
                    </Section>
                </Panel>
            ) : null}

            {server ? null : (
            <Panel>
                <Section label="Not visible from outside">
                    {INSIDE_SERVER_AREAS.map((a) => (
                        <Row key={a.label} label={a.label} state={<span title={a.detail}>Not tested</span>} />
                    ))}
                </Section>
                <p className="border-t border-border/70 px-5 py-3 text-sm text-muted-foreground">
                    A check from outside cannot see inside your server. A server check run on the machine itself covers the items above. It is not part of this check.
                </p>
            </Panel>
            )}

            <Panel>
                <Section label="Coverage">
                    {areas
                        .filter(([, a]) => a.applicable)
                        .map(([area, a]) => (
                            <Row key={area} label={areaLabel(area)} state={`${a.completed} of ${a.checks} checks · ${Math.round(a.weighted * 100)}%`} />
                        ))}
                    <Row label={<span className="font-normal text-muted-foreground">Passed</span>} state={String(passedCount(report))} />
                </Section>
                <Disclosure label="Limits of this check">
                    <ul className="list-disc space-y-1.5 px-5 pb-4 pl-10 text-sm text-muted-foreground">
                        {report.limitations.map((l) => (
                            <li key={l}>{l}</li>
                        ))}
                    </ul>
                </Disclosure>
            </Panel>
        </div>
    );
}
