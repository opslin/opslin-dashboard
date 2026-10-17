"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "./rows";
import { Button } from "@/components/ui/button";
import type { SecurityCheckTarget, SecurityCheckUsage } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { gradeClass, progressLabel } from "./format";
import { ReportView } from "./report-view";
import { StressPanel } from "./stress-panel";
import { awaitsStress, errorMessage, isActiveScan, useSecurityCheckActions, useSecurityCheckHistory, useSecurityCheckOverview, useSecurityCheckScan } from "./use-security-check";

/** Step 3: run a check and read the report. The layout stays the same while a check runs. */
export function ResultsStep({ target, usage }: { target: SecurityCheckTarget; usage: SecurityCheckUsage | undefined }) {
    const { start, remove } = useSecurityCheckActions();
    const [error, setError] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const latest = target.latest;
    const history = useSecurityCheckHistory(target.id, true);
    const shownId = picked ?? latest?.id ?? null;
    const scan = useSecurityCheckScan(shownId);
    const running = isActiveScan(scan.data?.scan ?? latest) || awaitsStress(scan.data?.scan ?? latest);
    const limitReached = usage ? usage.used >= usage.limit : false;
    const overview = useSecurityCheckOverview();
    const stressUsage = overview.data?.stressUsage;
    const stressLeft = stressUsage ? stressUsage.used < stressUsage.limit : true;
    const [withStress, setWithStress] = useState(true);
    const includeStress = withStress && stressLeft;

    const run = async () => {
        setError(null);
        try {
            setPicked(null);
            await start.mutateAsync({ id: target.id, includeStress });
        } catch (e) {
            setError(errorMessage(e, "Couldn't start the check."));
        }
    };

    const failed = scan.data?.scan.status === "FAILED" ? scan.data.scan : null;
    const scans = useMemo(() => history.data?.scans.filter((s) => s.status === "COMPLETED") ?? [], [history.data]);

    return (
        <div className="space-y-4">
            <Panel>
                <Section>
                    <Row
                        label={target.hostname}
                        state={running ? <span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{progressLabel((scan.data?.scan ?? latest)?.progress)}</span> : target.verifiedUntil ? `Verified · ${target.verifyMethod === "opslin-domain" ? "connected in Opslin" : "proof checked just now"}` : undefined}
                        action={
                            <Button onClick={run} disabled={start.isPending || running || limitReached}>
                                {start.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                {latest ? "Run again" : "Run check"}
                            </Button>
                        }
                    />
                    {error ? (
                        <p role="alert" className="px-5 pb-3 text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <label className="flex items-start gap-2.5 px-5 pb-3 text-sm text-muted-foreground">
                        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={includeStress} disabled={!stressLeft || running} onChange={(e) => setWithStress(e.target.checked)} />
                        <span>
                            Also test how much traffic the site can handle (about 80 seconds more)
                            {!stressLeft ? <span className="block">You have used all your stress tests for this month.</span> : null}
                        </span>
                    </label>
                    {limitReached && !error ? <p className="px-5 pb-3 text-sm text-muted-foreground">You have used all {usage?.limit} checks for this month.</p> : null}
                    {failed ? (
                        <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">
                            {failed.errorMessage ?? "The last check didn't finish."}
                        </p>
                    ) : null}
                </Section>
            </Panel>

            {scan.data?.report && scan.data.scan.status === "COMPLETED" ? (
                <ReportView report={scan.data.report} diff={scan.data.diff} completedAt={scan.data.scan.completedAt} afterSummary={<StressPanel target={target} requested={scan.data.scan.progress ?? null} />} />
            ) : (
                <StressPanel target={target} requested={scan.data?.scan.progress ?? latest?.progress ?? null} />
            )}

            {scans.length > 1 ? (
                <Panel>
                    <Section label="Earlier checks">
                        {scans.map((s) => (
                            <Row
                                key={s.id}
                                label={s.completedAt ? formatRelativeTime(s.completedAt) : "Earlier"}
                                state={<span className={s.graded ? gradeClass(s.grade) : undefined}>{s.graded && s.grade ? `Grade ${s.grade}` : "Incomplete"}</span>}
                                action={
                                    <Button variant="ghost" size="sm" disabled={s.id === shownId} onClick={() => setPicked(s.id)}>
                                        {s.id === shownId ? "Showing" : "View"}
                                    </Button>
                                }
                            />
                        ))}
                    </Section>
                </Panel>
            ) : null}

            <Panel>
                <Section>
                    <Row
                        label={<span className="text-sm font-normal text-muted-foreground">Remove this domain and its history</span>}
                        action={
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={remove.isPending || running}
                                onClick={async () => {
                                    try {
                                        await remove.mutateAsync(target.id);
                                        window.location.assign("/security-check");
                                    } catch (e) {
                                        toast.error(errorMessage(e, "Couldn't remove that domain."));
                                    }
                                }}
                            >
                                Remove
                            </Button>
                        }
                    />
                </Section>
            </Panel>
        </div>
    );
}
