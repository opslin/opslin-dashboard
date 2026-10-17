"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Disclosure, Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "./rows";
import { Button } from "@/components/ui/button";
import type { SecurityCheckTarget } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { stressProgressLabel, stressStageLabel, stressStateClass, stressStateText } from "./format";
import { errorMessage, isActiveScan, useSecurityCheckActions, useSecurityCheckOverview, useStressTest } from "./use-security-check";

const ms = (n: number | null) => (n === null ? "–" : `${n} ms`);

/** Level 3: a short, capped traffic test. Same flat rows as the check above it; the confirmation sits in the row's own place. */
export function StressPanel({ target, requested }: { target: SecurityCheckTarget; requested?: { includeStress?: boolean; stress?: { started: boolean; id?: string; reason?: string } } | null }) {
    const overview = useSecurityCheckOverview();
    const { startStress } = useSecurityCheckActions();
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const latest = overview.data?.targets.find((t) => t.id === target.id)?.latestStress ?? null;
    const usage = overview.data?.stressUsage;
    const run = useStressTest(latest?.id);
    const summary = run.data?.stress ?? latest;
    const result = run.data?.result ?? null;
    const running = isActiveScan(summary);
    const limitReached = usage ? usage.used >= usage.limit : false;
    const scheme = result?.target.scheme ?? "https";

    const begin = async () => {
        setError(null);
        try {
            await startStress.mutateAsync(target.id);
            setConfirming(false);
        } catch (e) {
            setError(errorMessage(e, "Couldn't start the test."));
        }
    };

    // The stress test that was asked for together with the check: waiting for the checks, or refused with a reason.
    const waiting = requested?.includeStress === true && !requested.stress;
    const skipped = requested?.includeStress === true && requested.stress?.started === false ? requested.stress.reason ?? null : null;

    let state: React.ReactNode;
    if (waiting) state = "Starts after the checks…";
    else if (running) state = <span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{stressProgressLabel(summary?.progress)}</span>;
    else if (summary?.status === "COMPLETED" && summary.completedAt) state = `Last run ${formatRelativeTime(summary.completedAt)}`;
    else if (summary?.status === "FAILED") state = "Didn't run";
    else state = "Not run yet";

    return (
        <Panel>
            <Section label="Stress test">
                <Row
                    label="How much traffic can this site handle?"
                    state={state}
                    action={
                        confirming ? undefined : (
                            <Button variant={summary ? "outline" : "default"} onClick={() => { setError(null); setConfirming(true); }} disabled={running || waiting || limitReached || startStress.isPending}>
                                {summary ? "Run again" : "Run test"}
                            </Button>
                        )
                    }
                />
                {confirming ? (
                    <div className="space-y-3 px-5 py-3">
                        <p className="text-sm text-foreground">
                            This sends up to 10 requests per second to {scheme}://{target.hostname}/ for about 80 seconds, in steps, and stops by itself if the site slows down, fails or starts refusing requests. Only run it on a site you are happy to test.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={begin} disabled={startStress.isPending}>
                                {startStress.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                Start test
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={startStress.isPending}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : null}
                {error ? <p role="alert" className="px-5 pb-3 text-sm text-destructive">{error}</p> : null}
                {skipped ? <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">The stress test was not run: {skipped}</p> : null}
                {limitReached && !error ? <p className="px-5 pb-3 text-sm text-muted-foreground">You have used all {usage?.limit} stress tests for this month.</p> : null}
                {summary?.status === "FAILED" ? <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">{summary.errorMessage ?? "The last test didn't finish."}</p> : null}
            </Section>

            {result && summary?.status === "COMPLETED" ? (
                <>
                    <Section>
                        <Row label={<span className="font-semibold">{result.verdict.headline}</span>} />
                    </Section>
                    <Section label="Step by step">
                        {result.stages.map((s) => (
                            <Row
                                key={`${s.label}-${s.rps}`}
                                label={stressStageLabel(s)}
                                state={
                                    <span className="inline-flex flex-wrap items-center gap-x-3">
                                        {s.state !== "skipped" ? <span className="text-xs">95% under {ms(s.p95)}</span> : null}
                                        <span className={stressStateClass(s.state)}>{stressStateText(s.state)}</span>
                                    </span>
                                }
                            />
                        ))}
                    </Section>
                    <Disclosure label="Details and limits of this test">
                        <dl className="space-y-2 px-5 pb-4 pl-12 text-sm">
                            {result.stages.filter((s) => s.state !== "skipped").map((s) => (
                                <div key={`d-${s.label}-${s.rps}`}>
                                    <dt className="font-medium text-foreground">{stressStageLabel(s)}</dt>
                                    <dd className="text-muted-foreground">
                                        {s.sent} sent, {s.ok} fine, {s.errors} failed, {s.limited} refused{s.dropped ? `, ${s.dropped} not sent (site too slow)` : ""}. Typical {ms(s.p50)}, 95% under {ms(s.p95)}{s.unstable ? " (few answers, rough)" : ""}.
                                        {s.note ? ` ${s.note}` : ""}
                                    </dd>
                                </div>
                            ))}
                            {result.verdict.details.map((d) => (
                                <p key={d} className="text-foreground">{d}</p>
                            ))}
                            {result.limitations.map((l) => (
                                <p key={l} className="text-muted-foreground">{l}</p>
                            ))}
                        </dl>
                    </Disclosure>
                </>
            ) : null}
        </Panel>
    );
}
