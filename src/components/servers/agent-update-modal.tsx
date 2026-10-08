"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Copy, Download, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { api, ApiRequestError, type AgentUpdateInfo, type ServerJobStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type AgentUpdateModalProps = {
    serverId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function updateBlockedReason(info: AgentUpdateInfo) {
    if (info.activeUpdateJob) {
        return null;
    }
    if (info.blockedReason) {
        return info.blockedReason;
    }
    if (!info.updateAvailable) {
        return "This server is already running the latest stable agent.";
    }
    if (!info.connected) {
        return "The agent must be online before Opslin can send the update job.";
    }
    if (info.queueAvailable === false) {
        return info.queueError || "Job queue is unavailable. Opslin workers or Redis must be healthy before updates can start.";
    }
    if (info.jobStoreAvailable === false) {
        return info.jobStoreError || "Agent update job storage is unavailable. The API needs Prisma generate/migrations before updates can start.";
    }
    if (info.manualUpdateRequired) {
        return `Manual update required. This version cannot receive the secure agent_update job yet. Run one manual update; after that, future updates are controlled from the dashboard.`;
    }
    return null;
}

function objectField(value: unknown, key: string) {
    return value && typeof value === "object" && key in value
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

function jobTargetVersion(job?: ServerJobStatus | null) {
    const payloadVersion = objectField(job?.payload, "version");
    if (typeof payloadVersion === "string") {
        return payloadVersion;
    }
    const resultVersion = objectField(job?.result, "version");
    return typeof resultVersion === "string" ? resultVersion : null;
}

function shouldTrackUpdateJob(info: AgentUpdateInfo, job?: ServerJobStatus | null) {
    if (!job) {
        return false;
    }
    if (job.status === "PENDING" || job.status === "RUNNING" || job.status === "FAILED") {
        return true;
    }
    return jobTargetVersion(job) === info.latestVersion;
}

const updateStages = [
    { key: "queued", label: "Queued" },
    { key: "dispatching", label: "Dispatching" },
    { key: "downloading", label: "Downloading" },
    { key: "verifying_sha256", label: "Verifying checksum" },
    { key: "validating_version", label: "Checking version" },
    { key: "backing_up", label: "Backing up" },
    { key: "replacing_binary", label: "Replacing binary" },
    { key: "restarting_agent", label: "Restarting agent" },
    { key: "updated", label: "Updated" },
];

function formatEta(seconds?: number | null) {
    if (!seconds) return "Starting soon";
    if (seconds < 60) return `About ${seconds}s`;
    return `About ${Math.ceil(seconds / 60)}m`;
}

function phaseIndex(job?: ServerJobStatus | null, connected?: boolean, latest?: string, current?: string | null) {
    if (!job) return 0;
    if (job.status === "COMPLETED" && connected && current === latest) {
        return updateStages.length - 1;
    }
    if (job.status === "COMPLETED") {
        return updateStages.findIndex((stage) => stage.key === "restarting_agent");
    }
    if (job.status === "FAILED") {
        return Math.max(0, updateStages.findIndex((stage) => stage.key === job.progress?.phase));
    }
    const phase = job.progress?.phase || (job.status === "PENDING" ? "queued" : "dispatching");
    const index = updateStages.findIndex((stage) => stage.key === phase);
    return index >= 0 ? index : 1;
}

const stepGroups = [
    { label: "Downloading", keys: ["queued", "dispatching", "downloading"] },
    { label: "Installing", keys: ["verifying_sha256", "validating_version", "backing_up", "replacing_binary"] },
    { label: "Restarting agent", keys: ["restarting_agent", "updated"] },
];

function UpdateTracker({ info, job, targetName }: { info: AgentUpdateInfo; job: ServerJobStatus; targetName?: string }) {
    const index = phaseIndex(job, info.connected, info.latestVersion, info.currentVersion);
    const failed = job.status === "FAILED";
    const waitingReconnect = job.status === "COMPLETED" && (!info.connected || info.currentVersion !== info.latestVersion);
    const finished = job.status === "COMPLETED" && !waitingReconnect;
    const percent = finished ? 100 : (job.progress?.percent ?? (job.status === "PENDING" ? 5 : job.status === "COMPLETED" ? 95 : 35));
    const activeKey = updateStages[index]?.key ?? "queued";
    const activeGroup = Math.max(0, stepGroups.findIndex((group) => group.keys.includes(activeKey)));

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{finished ? "Agent updated" : failed ? "Update failed" : "Updating agent"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {finished ? `v${info.latestVersion} is running${targetName ? ` on ${targetName}` : ""}.` : `Installing v${info.latestVersion}${targetName ? ` on ${targetName}` : ""}`}
                </p>
            </div>
            <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                    <span className="text-foreground">{finished ? "Done" : failed ? "Stopped" : waitingReconnect ? "Waiting for the agent to reconnect…" : "Updating…"}</span>
                    <span className="text-primary">{Math.round(percent)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="Update progress">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
                </div>
                {job.status === "PENDING" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Queue position {job.queuePosition ?? 1} · {formatEta(job.estimatedStartSeconds)}
                    </p>
                ) : null}
            </div>
            <ul className="divide-y rounded-xl border">
                {stepGroups.map((group, i) => {
                    const done = finished || i < activeGroup;
                    const active = i === activeGroup && !finished && !failed;
                    const bad = i === activeGroup && failed;
                    return (
                        <li key={group.label} className="flex items-center gap-3 px-4 py-3.5 text-sm">
                            <span className="flex size-5 items-center justify-center">
                                {done ? <span className="size-2.5 rounded-full bg-success" aria-hidden="true" /> : active ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : bad ? <AlertTriangle className="size-4 text-danger-text" aria-hidden="true" /> : <span className="size-2.5 rounded-full bg-muted-foreground/30" aria-hidden="true" />}
                            </span>
                            <span className={cn("font-medium", done || active ? "text-foreground" : "text-muted-foreground")}>{group.label}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{done ? "Complete" : active ? "In progress" : bad ? "Failed" : "Waiting"}</span>
                        </li>
                    );
                })}
            </ul>
            {failed && job.error ? (
                <div role="alert" className="flex gap-2 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {job.error}
                </div>
            ) : (
                <div className={cn("flex items-center gap-2 rounded-xl px-4 py-3 text-sm", finished ? "bg-success-muted text-success-text" : "bg-muted/60 text-muted-foreground")}>
                    <Check className="size-4" aria-hidden="true" />
                    {finished ? <strong>Agent updated</strong> : <span>After completion: <strong className="text-foreground">Agent updated</strong></span>}
                </div>
            )}
        </div>
    );
}

export function AgentUpdateModal({ serverId, open, onOpenChange }: AgentUpdateModalProps) {
    const queryClient = useQueryClient();
    const [trackingJobId, setTrackingJobId] = useState<string | null>(null);
    const [liveProgress, setLiveProgress] = useState<ServerJobStatus["progress"] | null>(null);
    const updateQuery = useQuery({
        queryKey: ["agent-update", serverId],
        queryFn: () => api.getAgentUpdateInfo(serverId),
        enabled: open && Boolean(serverId),
        refetchInterval: open ? 5000 : false,
    });

    useEffect(() => {
        if (open && updateQuery.data?.activeUpdateJob?.id && !trackingJobId) {
            setTrackingJobId(updateQuery.data.activeUpdateJob.id);
        }
    }, [open, trackingJobId, updateQuery.data?.activeUpdateJob?.id]);

    const jobQuery = useQuery({
        queryKey: ["server-job", serverId, trackingJobId],
        queryFn: () => api.getServerJobStatus(serverId, trackingJobId!),
        enabled: open && Boolean(serverId) && Boolean(trackingJobId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "COMPLETED" || status === "FAILED" ? 5000 : 2500;
        },
    });

    useEffect(() => {
        if (!open || !trackingJobId || typeof window === "undefined") {
            return;
        }
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const socket = new WebSocket(`${apiBaseUrl.replace(/^http/, "ws")}/jobs/${trackingJobId}/live`);
        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data) as Record<string, unknown>;
                setLiveProgress({
                    phase: typeof payload.phase === "string" ? payload.phase : typeof payload.stage === "string" ? payload.stage : null,
                    percent: typeof payload.percent === "number" ? payload.percent : typeof payload.percentage === "number" ? payload.percentage : null,
                    message: typeof payload.line === "string" ? payload.line : typeof payload.description === "string" ? payload.description : null,
                    status: typeof payload.status === "string" ? payload.status : null,
                    elapsedMs: typeof payload.elapsedMs === "number" ? payload.elapsedMs : null,
                });
            } catch {
                // Keep polling fallback active.
            }
        };
        return () => socket.close();
    }, [open, trackingJobId]);

    const updateMutation = useMutation({
        mutationFn: () => api.updateAgent(serverId),
        onSuccess: async (result) => {
            setTrackingJobId(result.jobId);
            setLiveProgress({
                phase: "queued",
                percent: 5,
                message: `Queue position ${result.queuePosition ?? 1}; ${formatEta(result.estimatedStartSeconds)}.`,
                status: "queued",
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
                queryClient.invalidateQueries({ queryKey: ["servers"] }),
                queryClient.invalidateQueries({ queryKey: ["agent-update", serverId] }),
                queryClient.invalidateQueries({ queryKey: ["server-job", serverId, result.jobId] }),
            ]);
        },
        onError: (error) => {
            if (error instanceof ApiRequestError && error.details.message) {
                toast.error(error.details.message);
                return;
            }
            toast.error(error instanceof Error ? error.message : "Unable to queue agent update");
        },
    });

    const info = updateQuery.data;
    const blockedReason = info ? updateBlockedReason(info) : null;
    const trackedJob = useMemo(() => {
        const latestRelevantJob = info && shouldTrackUpdateJob(info, info.lastUpdateJob)
            ? info.lastUpdateJob
            : null;
        const job = jobQuery.data || info?.activeUpdateJob || latestRelevantJob || null;
        if (!job) return null;
        return liveProgress
            ? { ...job, progress: { ...(job.progress || {}), ...liveProgress } }
            : job;
    }, [info?.activeUpdateJob, info?.lastUpdateJob, jobQuery.data, liveProgress]);
    const canRetry = trackedJob?.status === "FAILED" && info?.updateAvailable && info.connected && info.canSelfUpdate;

    const latest = info?.release;
    const highlights = latest ? [...latest.newFunctions, ...latest.bugFixes, ...latest.whyUpdate].slice(0, 3) : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false} className="max-h-[90vh] max-w-[480px] gap-0 overflow-y-auto rounded-2xl border bg-card p-7 shadow-2xl backdrop-blur-none">
                <DialogTitle className="sr-only">Update agent</DialogTitle>
                <DialogDescription className="sr-only">Review and approve the Opslin agent update.</DialogDescription>

                {updateQuery.isLoading && (
                    <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading agent release details…
                    </div>
                )}

                {updateQuery.error && (
                    <div role="alert" className="flex gap-2 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger-text">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {updateQuery.error instanceof Error ? updateQuery.error.message : "Unable to load update details. Try again after the server reconnects."}
                    </div>
                )}

                {info && trackedJob ? (
                    <>
                        <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Download className="size-5" aria-hidden="true" /></span>
                        <UpdateTracker info={info} job={trackedJob} />
                    </>
                ) : null}

                {info && !trackedJob ? (
                    <div className="space-y-5">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Download className="size-5" aria-hidden="true" /></span>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">Update agent</h2>
                            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                                <span>v{info.currentVersion || "?"}</span>
                                <ArrowRight className="size-3.5" aria-hidden="true" />
                                <span className="font-medium text-foreground">v{info.latestVersion}</span>
                            </p>
                        </div>
                        {highlights.length > 0 ? (
                            <section className="rounded-xl border bg-muted/30 p-4">
                                <h3 className="text-sm font-semibold text-foreground">What&apos;s new in v{info.latestVersion}</h3>
                                <ul className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
                                    {highlights.map((item) => (
                                        <li key={item} className="flex gap-2.5"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />{item}</li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                        {blockedReason ? (
                            <div role="alert" className="flex gap-2 rounded-xl border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {blockedReason}
                            </div>
                        ) : (
                            <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                Opslin checks the download&apos;s SHA-256, then restarts only the agent. Your apps keep running.
                            </div>
                        )}
                        <details className="group rounded-xl border px-4 py-3 text-sm">
                            <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-foreground">
                                Release details
                                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                            </summary>
                            <div className="mt-3 space-y-3 text-muted-foreground">
                                {[["Why this update matters", info.release.whyUpdate], ["Bug fixes", info.release.bugFixes], ["New agent functions", info.release.newFunctions], ["What changes on your VPS", info.release.vpsChanges], ["Security verification", info.release.securityNotes]].map(([title, items]) => (
                                    <div key={title as string}>
                                        <h4 className="font-semibold text-foreground">{title as string}</h4>
                                        <ul className="mt-1 list-disc space-y-1 pl-5">{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
                                    </div>
                                ))}
                                <p className="break-all font-mono text-xs">SHA-256: {info.artifact.sha256}</p>
                            </div>
                        </details>
                        {info.manualUpdateRequired ? (
                            <div className="rounded-xl border p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-foreground">Manual fallback</h3>
                                    <Button
                                        id="agent-update-copy-manual-command"
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            void navigator.clipboard?.writeText(info.manualFallbackCommand);
                                            toast.success("Manual command copied");
                                        }}
                                    >
                                        <Copy aria-hidden="true" /> Copy
                                    </Button>
                                </div>
                                <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground">{info.manualFallbackCommand}</pre>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <DialogFooter className="mt-6 flex-row justify-end gap-3 sm:justify-end">
                    <Button id="agent-update-cancel" type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                        {trackedJob ? "Close" : "Cancel"}
                    </Button>
                    {!trackedJob || canRetry ? (
                        <Button id="agent-update-confirm" type="button" size="lg" disabled={!info || Boolean(blockedReason) || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                            {updateMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                            {canRetry ? "Retry update" : "Update now"}
                        </Button>
                    ) : null}
                </DialogFooter>
                <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="absolute right-5 top-5 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="size-5" aria-hidden="true" />
                </button>
            </DialogContent>
        </Dialog>
    );
}
