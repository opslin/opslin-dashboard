"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock3, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { api, ApiRequestError, type ServerCleanupResult, type ServerJobStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type ServerCleanupModalProps = {
    serverId: string;
    serverName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const cleanupStages = [
    { key: "pre_check", label: "Checking current app health" },
    { key: "cleanup", label: "Pruning stale Docker artifacts" },
    { key: "security", label: "Scanning and applying security fixes" },
    { key: "post_check", label: "Verifying app health" },
    { key: "done", label: "Done" },
];

const TASKS = [
    { title: "Remove unused Docker images and logs", detail: "Stale images, stopped containers and old build cache" },
    { title: "Apply security updates", detail: "Safe OS patches and hardening checks" },
    { title: "Set up a safe firewall", detail: "Allow SSH, 80 and 443 with automatic rollback" },
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

function summarize(result: ServerCleanupResult) {
    const reclaimed = result.prunes.filter((p) => !p.error && p.reclaimedSpace && p.reclaimedSpace !== "0B").map((p) => p.reclaimedSpace);
    const findings = [...result.hardening.immediate, ...result.hardening.connectivityRisk];
    const applied = findings.filter((f) => f.applied && !f.error);
    const failed = findings.filter((f) => f.error);
    const unhealthy = result.apps.filter((app) => app.restartAttempted && !app.healthyAfterRestart);
    const rows = [
        reclaimed.length > 0 ? `Reclaimed ${reclaimed.join(" + ")} of disk space` : "No stale Docker data to remove",
        applied.length > 0 ? `${applied.length} security ${applied.length === 1 ? "fix" : "fixes"} applied (${applied.map((f) => hardeningKindLabel(f.kind)).join(", ")})` : "Security checks passed, nothing to fix",
        result.apps.length > 0 ? `${result.apps.length} ${result.apps.length === 1 ? "app" : "apps"} checked after cleanup` : "No apps needed a health check",
    ];
    return { rows, failed, unhealthy };
}

function CleanupProgress({ job, serverName }: { job: ServerJobStatus; serverName?: string }) {
    const index = stageIndex(job);
    const failed = job.status === "FAILED";
    const result = parseResult(job);
    const percent = job.status === "COMPLETED" ? 100 : (job.progress?.percent ?? (job.status === "PENDING" ? 5 : 30));

    if (result) {
        const { rows, failed: failedChecks, unhealthy } = summarize(result);
        return (
            <div className="space-y-5 text-center">
                <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-muted text-success-text"><Check className="size-8" aria-hidden="true" /></span>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Server clean and secure</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Maintenance completed successfully{serverName ? ` on ${serverName}` : ""}.</p>
                </div>
                <ul className="space-y-3 rounded-xl border p-4 text-left">
                    {rows.map((row) => (
                        <li key={row} className="flex items-start gap-3 text-sm text-foreground"><Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden="true" />{row}</li>
                    ))}
                </ul>
                {failedChecks.length > 0 || unhealthy.length > 0 ? (
                    <div role="alert" className="flex gap-2 rounded-xl border border-warning/30 bg-warning-muted px-4 py-3 text-left text-sm text-warning-text">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                            {failedChecks.length > 0 ? `${failedChecks.map((f) => `${hardeningKindLabel(f.kind)}: ${f.error}`).join(" · ")}. ` : ""}
                            {unhealthy.length > 0 ? `${unhealthy.map((a) => a.appName).join(", ")} did not come back healthy after a restart. Check logs or deploy history.` : ""}
                        </span>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{failed ? "Clean-up failed" : "Cleaning up…"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{job.progress?.message || "Waiting for the agent to start."}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="Clean-up progress">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(5, Math.min(100, percent))}%` }} />
            </div>
            <ul className="divide-y rounded-xl border">
                {cleanupStages.slice(0, 4).map((stage, i) => {
                    const done = i < index;
                    const active = i === index && !failed;
                    return (
                        <li key={stage.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                            <span className="flex size-5 items-center justify-center">
                                {done ? <span className="size-2.5 rounded-full bg-success" aria-hidden="true" /> : active ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : i === index && failed ? <AlertTriangle className="size-4 text-danger-text" aria-hidden="true" /> : <Clock3 className="size-3.5 text-muted-foreground/60" aria-hidden="true" />}
                            </span>
                            <span className={cn(done || active ? "text-foreground" : "text-muted-foreground")}>{stage.label}</span>
                        </li>
                    );
                })}
            </ul>
            {failed && job.error ? (
                <div role="alert" className="flex gap-2 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {job.error}
                </div>
            ) : null}
        </div>
    );
}

export function ServerCleanupModal({ serverId, serverName, open, onOpenChange }: ServerCleanupModalProps) {
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

    const done = job?.status === "COMPLETED";

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
            <DialogContent showCloseButton={false} className="max-h-[90vh] max-w-[480px] gap-0 overflow-y-auto rounded-2xl border bg-card p-7 shadow-2xl backdrop-blur-none">
                <DialogTitle className="sr-only">Clean and secure this server</DialogTitle>
                <DialogDescription className="sr-only">Prune stale Docker data, apply security fixes and verify app health.</DialogDescription>

                {job ? (
                    <CleanupProgress job={job} serverName={serverName} />
                ) : (
                    <div className="space-y-5">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5" aria-hidden="true" /></span>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">Clean and secure this server</h2>
                            <p className="mt-1 text-sm text-muted-foreground">These maintenance tasks will run{serverName ? ` on ${serverName}` : ""}.</p>
                        </div>
                        <ul className="divide-y rounded-xl border">
                            {TASKS.map((task) => (
                                <li key={task.title} className="flex items-start gap-3.5 px-4 py-3.5">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true"><Check className="size-3.5" strokeWidth={3} /></span>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{task.title}</p>
                                        <p className="text-xs text-muted-foreground">{task.detail}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                            <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                            Takes a few minutes. The agent must be online. Running apps are only restarted if clean-up disrupts them.
                        </div>
                    </div>
                )}

                <DialogFooter className="mt-6 flex-row justify-end gap-3 sm:justify-end">
                    {done ? (
                        <Button id="server-cleanup-close" type="button" variant="dark" size="lg" className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
                    ) : (
                        <>
                            <Button id="server-cleanup-close" type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>{job ? "Close" : "Cancel"}</Button>
                            <Button id="server-cleanup-run" type="button" size="lg" disabled={cleanupMutation.isPending || running} onClick={() => cleanupMutation.mutate()}>
                                {cleanupMutation.isPending || running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                                {running ? "Running…" : job ? "Run again" : "Run clean-up"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
                <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="absolute right-5 top-5 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="size-5" aria-hidden="true" />
                </button>
            </DialogContent>
        </Dialog>
    );
}
