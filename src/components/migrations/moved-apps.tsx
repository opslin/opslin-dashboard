"use client";

import Link from "next/link";
import { ExternalLink, Info, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Disclosure, LockedLine, Row, Section } from "@/components/media/media-rows";
import { Button } from "@/components/ui/button";
import { useMigrationActions } from "@/hooks/use-migrations";
import type { MigrationView, MovedApp, PrecheckFinding } from "@/lib/migration-types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { errorText } from "./plan-review";

/** What the check found, in one short line. */
export function checkSummary(app: MovedApp): string {
    const r = app.precheck;
    if (!r) return "Checking";
    if (!r.reached) return "Couldn't open it";
    const { problems, warnings } = r.summary;
    if (problems === 0 && warnings === 0) return "Nothing wrong seen";
    const parts: string[] = [];
    if (problems > 0) parts.push(`${problems} problem${problems === 1 ? "" : "s"}`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
    return parts.join(", ");
}

function FindingRow({ finding }: { finding: PrecheckFinding }) {
    const icon =
        finding.level === "problem" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Problem" />
        : finding.level === "warning" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Warning" />
        : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Information" />;
    return (
        <li className="flex gap-3 px-5 py-3 text-sm">
            {icon}
            <div className="min-w-0 space-y-1">
                <p className="font-medium text-foreground">{finding.title}</p>
                <p className="text-muted-foreground">{finding.detail}</p>
                {finding.fix ? <p className="text-foreground/80"><span className="font-medium">To fix: </span>{finding.fix}</p> : null}
            </div>
        </li>
    );
}

/** The likely-problems report for one moved site. Problems and warnings are shown; the rest sits behind a disclosure. */
function Report({ app }: { app: MovedApp }) {
    const r = app.precheck;
    if (!r) return null;
    const important = r.findings.filter((f) => f.level === "problem" || f.level === "warning");
    const rest = r.findings.filter((f) => f.level === "info" || f.level === "ok");
    return (
        <>
            {important.length > 0 ? <ul className="divide-y divide-border/70">{important.map((f) => <FindingRow key={f.id} finding={f} />)}</ul> : null}
            {rest.length > 0 || r.notChecked.length > 0 ? (
                <Disclosure label="More about this check">
                    {rest.length > 0 ? <ul className="divide-y divide-border/70">{rest.map((f) => <FindingRow key={f.id} finding={f} />)}</ul> : null}
                    <div className="space-y-2 px-5 pb-4 pl-10 text-sm text-muted-foreground">
                        <p>Not tested by this check:</p>
                        <ul className="list-disc space-y-1 pl-5">{r.notChecked.map((n) => <li key={n}>{n}</li>)}</ul>
                    </div>
                </Disclosure>
            ) : null}
            <p className="px-5 pb-3 pt-1 text-xs text-muted-foreground">{r.disclaimer} Checked {formatRelativeTime(r.checkedAt)}.</p>
        </>
    );
}

function SiteRows({ view, app, showChecks }: { view: MigrationView; app: MovedApp; showChecks: boolean }) {
    const actions = useMigrationActions(view.id);
    const checking = actions.checkLinks.isPending && actions.checkLinks.variables === app.key;
    const stateText =
        app.state === "ready" ? undefined
        : app.state === "failed" ? <span className="text-destructive">Couldn't create</span>
        : app.state === "pending" ? <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Creating</span>
        : app.state === "skipped" ? "No temporary address"
        : "Removed";

    return (
        <Section>
            <Row
                label={
                    <span className="block min-w-0">
                        {app.state === "ready" && app.appId ? <Link href={`/apps/${app.appId}`} className="hover:underline">{app.label}</Link> : app.label}
                        {app.state === "ready" && app.domain ? <span className="block break-all font-mono text-xs font-normal text-muted-foreground">{app.domain}</span> : null}
                    </span>
                }
                state={stateText}
                action={
                    app.state === "ready" && app.url ? (
                        <Button asChild>
                            <a href={app.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                                Open site
                            </a>
                        </Button>
                    ) : app.state === "failed" && view.actions.canRetryLinks ? (
                        <Button variant="outline" onClick={() => actions.retryLinks.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't try again")) })} disabled={actions.retryLinks.isPending}>
                            {actions.retryLinks.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                            Try again
                        </Button>
                    ) : undefined
                }
            />
            {app.note && app.state !== "ready" ? (
                app.state === "failed" ? <p className="px-5 py-3 text-sm text-destructive" role="alert">{app.note}</p> : <LockedLine>{app.note}</LockedLine>
            ) : null}
            {showChecks && app.state === "ready" ? (
                <>
                    <Row
                        label="Likely problems"
                        state={
                            !app.precheck ? <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking</span>
                            : <span className={cn(app.precheck.summary.problems > 0 && "text-destructive", app.precheck.summary.problems === 0 && app.precheck.summary.warnings > 0 && "text-amber-700 dark:text-amber-500")}>{checkSummary(app)}</span>
                        }
                        action={
                            view.actions.canCheckLinks ? (
                                <Button variant="outline" onClick={() => actions.checkLinks.mutate(app.key, { onError: (e) => toast.error(errorText(e, "Couldn't check")) })} disabled={actions.checkLinks.isPending}>
                                    {checking ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                                    Check again
                                </Button>
                            ) : undefined
                        }
                    />
                    <Report app={app} />
                </>
            ) : null}
        </Section>
    );
}

/**
 * The moved web sites as Opslin apps: the temporary address that opens each, and what a quick look at that address
 * found. The address is for trying the project out; it is never presented as proof that the project works.
 */
export function MovedApps({ view, showChecks = true }: { view: MigrationView; showChecks?: boolean }) {
    const apps = (view.apps ?? []).filter((a) => a.state !== "removed");
    if (apps.length === 0) return null;
    return (
        <>
            {apps.map((app) => <SiteRows key={app.key} view={view} app={app} showChecks={showChecks} />)}
            {apps.some((a) => a.state === "ready") ? (
                <LockedLine>
                    {view.target.name} serves the temporary address through Cloudflare. To use your own domain, add it in the app's Domains tab.
                </LockedLine>
            ) : null}
        </>
    );
}
