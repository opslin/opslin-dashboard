"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Panel, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { gradeClass } from "@/components/security-check/format";
import { ReportView } from "@/components/security-check/report-view";
import { CheckRow as Row } from "@/components/security-check/rows";
import { errorMessage } from "@/components/security-check/use-security-check";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { isActiveHostCheck, isFeatureOff, useHostCheck, useHostCheckById, useHostCheckHistory, useStartHostCheck } from "./use-host-check";

/** The server security check: one focal grade, the same layout in every state (DESIGN.md). */
export function ServerCheckPage({ serverId, serverName, serverOnline }: { serverId: string; serverName: string | null; serverOnline: boolean | null }) {
    const latest = useHostCheck(serverId);
    const start = useStartHostCheck(serverId);
    const history = useHostCheckHistory(serverId, Boolean(latest.data?.check));
    const [picked, setPicked] = useState<string | null>(null);
    const [error, setError] = useState<{ message: string; code?: string; requiredVersion?: string } | null>(null);
    const chosen = useHostCheckById(serverId, picked);

    const running = isActiveHostCheck(latest.data?.check);
    const view = picked && chosen.data ? chosen.data : latest.data;
    const check = view?.check ?? null;
    const completed = useMemo(() => history.data?.checks.filter((c) => c.status === "COMPLETED") ?? [], [history.data]);

    const run = async () => {
        setError(null);
        setPicked(null);
        try {
            await start.mutateAsync();
        } catch (e) {
            const details = e instanceof ApiRequestError ? (e.details as { code?: string; requiredVersion?: string }) : {};
            setError({ message: errorMessage(e, "Couldn't start the check."), code: details.code, requiredVersion: details.requiredVersion });
        }
    };

    if (latest.isLoading) {
        return (
            <Panel aria-busy="true" aria-label="Loading server check">
                <Section>
                    <Row label={<SkeletonText className="h-4 w-48" />} />
                    <Row label={<SkeletonText className="h-4 w-32" />} />
                </Section>
            </Panel>
        );
    }
    if (isFeatureOff(latest.error)) {
        return (
            <Panel>
                <Section>
                    <Row label="The server check isn't turned on for your organization yet" state="Coming soon" />
                </Section>
            </Panel>
        );
    }

    const offline = serverOnline === false;
    const tooOld = error?.code === "agent_too_old";
    const failed = check?.status === "FAILED" ? check : null;

    return (
        <div className="space-y-4">
            <Panel>
                <Section>
                    <Row
                        label={serverName ?? "This server"}
                        state={
                            running ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                                    Checking the server…
                                </span>
                            ) : offline ? (
                                "The agent is offline"
                            ) : check?.status === "COMPLETED" && check.completedAt ? (
                                `Checked ${formatRelativeTime(check.completedAt)}`
                            ) : undefined
                        }
                        action={
                            tooOld ? (
                                <Button asChild>
                                    <Link href={`/servers/${serverId}`}>Update agent</Link>
                                </Button>
                            ) : (
                                <Button onClick={run} disabled={start.isPending || running || offline}>
                                    {start.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                    {latest.data?.check ? "Run again" : "Run check"}
                                </Button>
                            )
                        }
                    />
                    {error ? (
                        <p role="alert" className="px-5 pb-3 text-sm text-destructive">
                            {error.message}
                        </p>
                    ) : null}
                    {offline && !error ? <p className="px-5 pb-3 text-sm text-muted-foreground">Bring the agent online, then run the check.</p> : null}
                    {failed ? (
                        <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">
                            {failed.errorMessage ?? "The last check didn't finish."}
                        </p>
                    ) : null}
                    {!check && !running ? (
                        <p className="px-5 pb-3 text-sm text-muted-foreground">
                            Reads this server&apos;s settings from the inside and reports what it finds. It changes nothing, and takes about a minute.
                        </p>
                    ) : null}
                </Section>
            </Panel>

            {view?.report && check?.status === "COMPLETED" ? <ReportView report={view.report} diff={view.diff} completedAt={check.completedAt} variant="server" /> : null}

            {completed.length > 1 ? (
                <Panel>
                    <Section label="Earlier checks">
                        {completed.map((c) => (
                            <Row
                                key={c.id}
                                label={c.completedAt ? formatRelativeTime(c.completedAt) : "Earlier"}
                                state={<span className={c.graded ? gradeClass(c.grade) : undefined}>{c.graded && c.grade ? `Grade ${c.grade}` : "Incomplete"}</span>}
                                action={
                                    <Button variant="ghost" size="sm" disabled={c.id === (check?.id ?? null)} onClick={() => setPicked(c.id)}>
                                        {c.id === check?.id ? "Showing" : "View"}
                                    </Button>
                                }
                            />
                        ))}
                    </Section>
                </Panel>
            ) : null}
        </div>
    );
}

export function ServerCheckHeader({ serverId, serverName }: { serverId: string; serverName: string | null }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="icon-sm" aria-label="Back to the server">
                    <Link href={`/servers/${serverId}`}>
                        <ArrowLeft aria-hidden="true" />
                    </Link>
                </Button>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Server security check</h1>
            </div>
            {serverName ? <p className="text-sm text-muted-foreground">{serverName}</p> : null}
        </div>
    );
}
