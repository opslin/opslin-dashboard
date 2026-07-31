"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiRequestError, type ServerCleanupResult, type ServerJobStatus } from "@/lib/api";

type ServerCleanupModalProps = {
    serverId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const cleanupStages = [
    { key: "pre_check", label: "Checking current app health" },
    { key: "cleanup", label: "Pruning stale Docker artifacts" },
    { key: "security", label: "Scanning and applying security fixes" },
    { key: "post_check", label: "Verifying app health after cleanup and security fixes" },
    { key: "done", label: "Done" },
];

const hardeningKindLabels: Record<string, string> = {
    ssh_config: "SSH configuration",
    ufw_baseline: "Firewall (ufw) baseline",
    fail2ban_baseline: "fail2ban baseline",
    exposed_ports: "Exposed ports",
    os_patches: "OS security patches",
    file_permissions: "File permissions",
};

function hardeningKindLabel(kind: string) {
    return hardeningKindLabels[kind] || kind;
}

function stageIndex(job?: ServerJobStatus | null) {
    if (!job) return -1;
    if (job.status === "COMPLETED") return cleanupStages.length - 1;
    if (job.status === "FAILED") {
        const failedAt = cleanupStages.findIndex((stage) => stage.key === job.progress?.phase);
        return failedAt >= 0 ? failedAt : 0;
    }
    const phase = job.progress?.phase || (job.status === "PENDING" ? "pre_check" : undefined);
    const index = cleanupStages.findIndex((stage) => stage.key === phase);
    return index >= 0 ? index : 0;
}

function parseResult(job?: ServerJobStatus | null): ServerCleanupResult | null {
    if (!job || job.status !== "COMPLETED" || !job.result) return null;
    return job.result as ServerCleanupResult;
}

function HardeningSummary({ result }: { result: ServerCleanupResult["hardening"] }) {
    const findings = [
        ...result.immediate.map((f) => ({ ...f, connectivityRisk: false as const })),
        ...result.connectivityRisk.map((f) => ({ ...f, connectivityRisk: true as const })),
    ];
    const failed = findings.filter((f) => f.error);

    return (
        <section className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="size-4 text-chart-5" />
                Security checks
            </h3>
            <div className="mt-2 space-y-2">
                {findings.map((finding) => (
                    <div
                        key={finding.kind}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background p-3 text-sm"
                    >
                        <div>
                            <p className="text-foreground">{hardeningKindLabel(finding.kind)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{finding.description}</p>
                        </div>
                        <Badge variant={finding.error ? "destructive" : finding.applied ? "secondary" : "outline"}>
                            {finding.error ? "Error" : finding.applied ? "Fixed" : "OK"}
                            {finding.connectivityRisk && finding.applied ? " · auto-confirming" : ""}
                        </Badge>
                    </div>
                ))}
            </div>
            {failed.length > 0 && (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Some security checks failed</AlertTitle>
                    <AlertDescription>
                        {failed.map((f) => `${hardeningKindLabel(f.kind)}: ${f.error}`).join(" · ")}
                    </AlertDescription>
                </Alert>
            )}
        </section>
    );
}

function CleanupSummary({ result }: { result: ServerCleanupResult }) {
    const anyRestarted = result.apps.some((app) => app.restartAttempted);
    const stillUnhealthy = result.apps.filter(
        (app) => app.restartAttempted && !app.healthyAfterRestart
    );

    return (
        <section className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <h3 className="text-sm font-semibold text-foreground">Reclaimed</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {result.prunes.map((prune) => (
                    <div key={prune.step} className="rounded-lg border border-border/70 bg-background p-3">
                        <p className="dashboard-section-label">{prune.step.replace("_", " ")}</p>
                        <p className="mt-1 text-sm text-foreground">
                            {prune.error ? "Failed" : prune.reclaimedSpace || "0B"}
                        </p>
                    </div>
                ))}
            </div>

            <div className="mt-4">
                <HardeningSummary result={result.hardening} />
            </div>

            {result.apps.length > 0 && (
                <>
                    <h3 className="mt-4 text-sm font-semibold text-foreground">App health</h3>
                    <div className="mt-2 space-y-2">
                        {result.apps.map((app) => (
                            <div
                                key={app.appId}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background p-3 text-sm"
                            >
                                <span className="text-foreground">{app.appName}</span>
                                <div className="flex items-center gap-2">
                                    {app.restartAttempted && (
                                        <Badge variant={app.healthyAfterRestart ? "secondary" : "destructive"}>
                                            {app.healthyAfterRestart ? "Restarted, healthy" : "Restarted, still unhealthy"}
                                        </Badge>
                                    )}
                                    {!app.restartAttempted && (
                                        <Badge variant={app.healthyAfter ? "secondary" : "outline"}>
                                            {app.healthyAfter ? "Healthy" : "Unchanged (was already unhealthy)"}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {anyRestarted && stillUnhealthy.length > 0 && (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Some apps need attention</AlertTitle>
                    <AlertDescription>
                        {stillUnhealthy.map((app) => app.appName).join(", ")} did not come back healthy after a
                        restart. Cleanup only restarts once — check logs or deploy history for the real cause.
                    </AlertDescription>
                </Alert>
            )}
        </section>
    );
}

function CleanupTracker({ job }: { job: ServerJobStatus }) {
    const index = stageIndex(job);
    const failed = job.status === "FAILED";
    const percent = job.progress?.percent ?? (job.status === "PENDING" ? 5 : job.status === "COMPLETED" ? 100 : 30);
    const result = parseResult(job);

    return (
        <section className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">
                        {failed ? "Cleanup failed" : job.status === "COMPLETED" ? "Cleanup complete" : "Cleanup running"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {job.progress?.message || "Waiting for the agent to start."}
                    </p>
                </div>
                <Badge variant={failed ? "destructive" : "secondary"}>{job.status}</Badge>
            </div>
            <div className="mt-4 h-2 rounded-full bg-background">
                <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(5, Math.min(100, percent))}%` }}
                />
            </div>
            <div className="mt-4 space-y-2">
                {cleanupStages.map((stage, i) => {
                    const done = i < index || (stage.key === "done" && job.status === "COMPLETED");
                    const active = i === index && !failed;
                    return (
                        <div key={stage.key} className="flex items-center gap-3 text-sm">
                            <span
                                className={`flex size-6 items-center justify-center rounded-full border ${
                                    done
                                        ? "border-chart-5 bg-chart-5/15 text-chart-5"
                                        : active
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground"
                                }`}
                            >
                                {done ? (
                                    <CheckCircle2 className="size-4" />
                                ) : active ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Clock3 className="size-3.5" />
                                )}
                            </span>
                            <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>
            {failed && job.error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{job.error}</AlertDescription>
                </Alert>
            )}
            {result && <div className="mt-4"><CleanupSummary result={result} /></div>}
        </section>
    );
}

export function ServerCleanupModal({ serverId, open, onOpenChange }: ServerCleanupModalProps) {
    const queryClient = useQueryClient();
    const [trackingJobId, setTrackingJobId] = useState<string | null>(null);
    const confirmedJobRef = useRef<string | null>(null);

    const jobQuery = useQuery({
        queryKey: ["server-job", serverId, trackingJobId],
        queryFn: () => api.getServerJobStatus(serverId, trackingJobId!),
        enabled: open && Boolean(serverId) && Boolean(trackingJobId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "COMPLETED" || status === "FAILED" ? false : 2000;
        },
    });

    // "No click needed" per the product decision: as soon as this modal sees
    // the job complete successfully, it confirms any auto-applied
    // connectivity-risk hardening fix on the user's behalf — same effect as
    // clicking "Keep" on each one, just automatic. If the job (or the whole
    // dashboard) never gets this far — the browser closes, the network
    // drops — nothing is silently lost: the fix still self-reverts on its
    // own via the server-side delayed job once the confirmation window
    // lapses, so staying unconfirmed always fails safe.
    useEffect(() => {
        const job = jobQuery.data;
        if (!job || job.status !== "COMPLETED" || !trackingJobId) {
            return;
        }
        if (confirmedJobRef.current === trackingJobId) {
            return;
        }
        confirmedJobRef.current = trackingJobId;

        void (async () => {
            try {
                const commits = await api.getServerHardeningCommits(serverId);
                const pending = commits.filter((c) => c.status === "PENDING_CONFIRMATION");
                for (const commit of pending) {
                    await api.keepHardeningCommit(serverId, commit.id);
                }
            } catch {
                // Best-effort — an unconfirmed fix still self-reverts safely
                // via its own delayed job, so a failure here isn't fatal.
            }
        })();
    }, [jobQuery.data, serverId, trackingJobId]);

    const cleanupMutation = useMutation({
        mutationFn: () => api.runServerCleanup(serverId),
        onSuccess: async (result) => {
            setTrackingJobId(result.jobId);
            await queryClient.invalidateQueries({ queryKey: ["server-job", serverId, result.jobId] });
        },
        onError: (error) => {
            if (error instanceof ApiRequestError && error.details.message) {
                toast.error(error.details.message);
                return;
            }
            toast.error(error instanceof Error ? error.message : "Unable to start cleanup");
        },
    });

    const job = jobQuery.data || null;
    const running = job ? job.status === "PENDING" || job.status === "RUNNING" : false;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setTrackingJobId(null);
                }
                onOpenChange(next);
            }}
        >
            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="size-5 text-primary" />
                        Clean &amp; Secure Server
                    </DialogTitle>
                    <DialogDescription>
                        Prunes stale Docker images, stopped containers, and aged build cache left over from past
                        deploys, then checks every app on this server is still healthy — restarting only the one
                        cleanup itself disrupted.
                    </DialogDescription>
                </DialogHeader>

                {!job && (
                    <Alert className="border-chart-4/40 bg-chart-4/10">
                        <AlertTriangle className="size-4 text-chart-4" />
                        <AlertTitle>Before you start</AlertTitle>
                        <AlertDescription>
                            The agent must be online. This never touches the currently running image or container
                            for any app, and never deletes tagged images your rollback history depends on.
                        </AlertDescription>
                    </Alert>
                )}

                {job && <CleanupTracker job={job} />}

                <DialogFooter>
                    <Button
                        id="server-cleanup-close"
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <Button
                        id="server-cleanup-run"
                        type="button"
                        disabled={cleanupMutation.isPending || running}
                        onClick={() => cleanupMutation.mutate()}
                    >
                        {(cleanupMutation.isPending || running) && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {!job && !cleanupMutation.isPending && <RefreshCw className="mr-2 size-4" />}
                        {running ? "Running..." : job ? "Run Again" : "Run Cleanup"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
