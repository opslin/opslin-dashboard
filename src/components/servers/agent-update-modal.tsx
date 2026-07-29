"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
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
import { api, ApiRequestError, type AgentUpdateInfo, type ServerJobStatus } from "@/lib/api";

type AgentUpdateModalProps = {
    serverId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function ReleaseSection({ title, items }: { title: string; items: string[] }) {
    return (
        <section className="rounded-lg border border-border/70 bg-secondary/25 p-4">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {items.map((item) => (
                    <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-chart-5" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

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

function UpdateTracker({
    info,
    job,
}: {
    info: AgentUpdateInfo;
    job: ServerJobStatus;
}) {
    const index = phaseIndex(job, info.connected, info.latestVersion, info.currentVersion);
    const waitingReconnect = job.status === "COMPLETED" && (!info.connected || info.currentVersion !== info.latestVersion);
    const failed = job.status === "FAILED";
    const percent = job.progress?.percent ?? (job.status === "PENDING" ? 5 : job.status === "COMPLETED" ? 95 : 35);
    const headline = failed
        ? "Agent update failed"
        : waitingReconnect
            ? "Update installed, waiting for agent reconnect"
            : job.status === "COMPLETED"
                ? "Agent updated"
                : job.status === "PENDING"
                    ? "Agent update queued"
                    : "Agent update running";

    return (
        <section className="rounded-xl border border-border/70 bg-secondary/25 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{headline}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {job.progress?.message || (job.status === "PENDING"
                            ? `Queue position ${job.queuePosition ?? 1}; ${formatEta(job.estimatedStartSeconds)}.`
                            : "Opslin is tracking the update job.")}
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
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-background p-3">
                    <p className="dashboard-section-label">Queue</p>
                    <p className="mt-1 text-sm text-foreground">
                        {job.queueError
                            ? job.queueError
                            : job.jobsAhead === null || job.jobsAhead === undefined
                            ? job.queueState || "tracking"
                            : `${job.jobsAhead} job${job.jobsAhead === 1 ? "" : "s"} ahead`}
                    </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background p-3">
                    <p className="dashboard-section-label">ETA</p>
                    <p className="mt-1 text-sm text-foreground">{formatEta(job.estimatedStartSeconds)}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background p-3">
                    <p className="dashboard-section-label">Target</p>
                    <p className="mt-1 font-mono text-sm text-foreground">{info.latestVersion}</p>
                </div>
            </div>
            <div className="mt-4 space-y-2">
                {updateStages.map((stage, stageIndex) => {
                    const done = stageIndex < index || (stage.key === "updated" && job.status === "COMPLETED" && info.connected && info.currentVersion === info.latestVersion);
                    const active = stageIndex === index && !failed;
                    return (
                        <div key={stage.key} className="flex items-center gap-3 text-sm">
                            <span className={`flex size-6 items-center justify-center rounded-full border ${done ? "border-chart-5 bg-chart-5/15 text-chart-5" : active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                                {done ? <CheckCircle2 className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-3.5" />}
                            </span>
                            <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{stage.label}</span>
                        </div>
                    );
                })}
            </div>
            {failed && job.error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Update failed</AlertTitle>
                    <AlertDescription>{job.error}</AlertDescription>
                </Alert>
            )}
        </section>
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className="size-5 text-primary" />
                        Update Opslin Agent
                    </DialogTitle>
                    <DialogDescription>
                        Review exactly what changes on this VPS before approving the update.
                    </DialogDescription>
                </DialogHeader>

                {updateQuery.isLoading && (
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/30 p-5 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading agent release details...
                    </div>
                )}

                {updateQuery.error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="size-4" />
                        <AlertTitle>Unable to load update details</AlertTitle>
                        <AlertDescription>
                            {updateQuery.error instanceof Error ? updateQuery.error.message : "Try again after the server reconnects."}
                        </AlertDescription>
                    </Alert>
                )}

                {info && (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                                <p className="dashboard-section-label">Installed</p>
                                <p className="mt-2 font-mono text-sm text-foreground">{info.currentVersion || "Unknown"}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                                <p className="dashboard-section-label">Latest Stable</p>
                                <p className="mt-2 font-mono text-sm text-foreground">{info.latestVersion}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                                <p className="dashboard-section-label">Secure Control</p>
                                <p className="mt-2 font-mono text-sm text-foreground">
                                    {info.isSecureControlCapable ? info.helperStatus : `Needs ${info.minimumSecureControlVersion}`}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{info.release.channel.toUpperCase()}</Badge>
                            <Badge variant={info.updateAvailable ? "default" : "secondary"}>
                                {info.updateAvailable ? "Update available" : "Current"}
                            </Badge>
                            <Badge variant={info.connected ? "secondary" : "destructive"}>
                                {info.connected ? "Agent online" : "Agent offline"}
                            </Badge>
                            <Badge variant="outline">{info.release.criticality}</Badge>
                            <Badge variant={info.isSecureControlCapable ? "secondary" : "outline"}>
                                Agent 2.0 Secure Control
                            </Badge>
                        </div>

                        {trackedJob && (
                            <UpdateTracker info={info} job={trackedJob} />
                        )}

                        {blockedReason && !trackedJob && (
                            <Alert className="border-chart-4/40 bg-chart-4/10">
                                <AlertTriangle className="size-4 text-chart-4" />
                                <AlertTitle>Action needed</AlertTitle>
                                <AlertDescription>{blockedReason}</AlertDescription>
                            </Alert>
                        )}

                        <ReleaseSection title="Why this update matters" items={info.release.whyUpdate} />
                        <ReleaseSection title="Bug fixes" items={info.release.bugFixes} />
                        <ReleaseSection title="New agent functions" items={info.release.newFunctions} />
                        <ReleaseSection title="What changes on your VPS" items={info.release.vpsChanges} />

                        <section className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <ShieldCheck className="size-4 text-chart-5" />
                                Security verification
                            </h3>
                            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                                {info.release.securityNotes.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                            <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                                SHA-256: {info.artifact.sha256}
                            </p>
                        </section>

                        {info.manualUpdateRequired && (
                            <section className="rounded-lg border border-border/70 bg-background p-4">
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
                                        <Copy className="mr-2 size-4" />
                                        Copy
                                    </Button>
                                </div>
                                <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary/60 p-3 text-xs text-foreground">
                                    {info.manualFallbackCommand}
                                </pre>
                            </section>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        id="agent-update-cancel"
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <Button
                        id="agent-update-confirm"
                        type="button"
                        disabled={!info || Boolean(blockedReason) || updateMutation.isPending || Boolean(trackedJob && !canRetry)}
                        onClick={() => updateMutation.mutate()}
                    >
                        {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {canRetry ? "Retry Update" : trackedJob ? "Update Queued" : "Update Agent"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
