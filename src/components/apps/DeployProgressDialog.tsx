"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, TriangleAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { api, type AutoDeployResult, type DeployProgressUnit } from "@/lib/api";

// DIL Phase 25 — the persistent counterpart to apps/new/page.tsx's own
// live-only progress card: openable from anywhere an AI-assisted deploy's
// App/DeployGroup is shown (an eye icon), any time — including long after
// the wizard tab that started the deploy is gone, or after a page refresh.
// Poll-only (no WS): GET /servers/:id/jobs/:jobId already returns a durable,
// server-persisted snapshot (Job.deployProgress), so a ~2.5s poll while
// RUNNING is enough to feel responsive for a "check on it" popup without
// duplicating agent-update-modal.tsx's WS-merge machinery for a surface
// that isn't the primary live-deploy experience.

type DeployProgressDialogProps = {
    serverId: string;
    jobId: string;
    appLabel?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const PHASE_LABEL: Record<string, string> = {
    analyzing: "Analyzing the repository",
    planned: "Build plan authored",
    deploying: "Deploying services",
    wiring: "Connecting services",
    completed: "Deploy finished",
    failed: "Deploy failed",
};

const UNIT_STATUS_META: Record<DeployProgressUnit["status"], { tone: StatusTone; label: string }> = {
    pending: { tone: "neutral", label: "Waiting" },
    deploying: { tone: "info", label: "Deploying" },
    done: { tone: "success", label: "Live" },
    blocked: { tone: "warning", label: "Needs attention" },
};

function UnitStatusIcon({ status }: { status: DeployProgressUnit["status"] }) {
    switch (status) {
        case "done":
            return <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden="true" />;
        case "deploying":
            return <Loader2 className="size-4 shrink-0 animate-spin text-info-text" aria-hidden="true" />;
        case "blocked":
            return <TriangleAlert className="size-4 shrink-0 text-warning-text" aria-hidden="true" />;
        default:
            return <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
    }
}

const ROLE_LABEL: Record<string, string> = {
    frontend: "Website",
    backend: "Backend",
    worker: "Worker",
    unknown: "Service",
};

export function DeployProgressDialog({ serverId, jobId, appLabel, open, onOpenChange }: DeployProgressDialogProps) {
    const jobQuery = useQuery({
        queryKey: ["server-job-status", serverId, jobId],
        queryFn: () => api.getServerJobStatus(serverId, jobId),
        enabled: open && Boolean(serverId) && Boolean(jobId),
        refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? 2500 : false),
    });

    const job = jobQuery.data;
    const snapshot = job?.deployProgress ?? null;
    // A job created before this phase shipped (or one whose very first
    // onProgress tick hasn't landed yet) has no durable snapshot — fall
    // back to the generic percent this route has always returned rather
    // than showing nothing.
    const percent = snapshot?.percent ?? job?.progress?.percent ?? (job?.status === "COMPLETED" ? 100 : 5);
    const phaseLabel = job?.status === "FAILED"
        ? PHASE_LABEL.failed
        : job?.status === "COMPLETED"
            ? PHASE_LABEL.completed
            : (snapshot?.phase && PHASE_LABEL[snapshot.phase]) || "Starting…";
    const result = job?.status === "COMPLETED" ? (job.result as AutoDeployResult | undefined) : undefined;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {job?.status === "FAILED" ? (
                            <XCircle className="size-4 text-destructive" />
                        ) : job?.status === "COMPLETED" ? (
                            <CheckCircle2 className="size-4 text-success-text" />
                        ) : (
                            <Loader2 className="size-4 animate-spin text-info-text" />
                        )}
                        Deploy progress
                    </DialogTitle>
                    <DialogDescription>
                        {appLabel ? `AI-assisted deploy for ${appLabel}.` : "AI-assisted deploy."}
                    </DialogDescription>
                </DialogHeader>

                {jobQuery.isLoading ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                ) : jobQuery.isError || !job ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Could not load this deploy&apos;s status.
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{phaseLabel}</span>
                                <span className="tabular-nums text-muted-foreground">{percent}%</span>
                            </div>
                            <Progress
                                value={percent}
                                className={job.status === "FAILED" ? "bg-destructive/20 [&>div]:bg-destructive" : undefined}
                            />
                        </div>

                        {job.status === "FAILED" && (
                            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
                                {job.error || snapshot?.message || "The deploy failed."}
                            </p>
                        )}

                        {snapshot && snapshot.units.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-medium uppercase text-muted-foreground">Services</p>
                                <ul className="flex flex-col gap-2">
                                    {snapshot.units.map((unit) => (
                                        <li
                                            key={unit.unitPath || unit.role}
                                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2"
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <UnitStatusIcon status={unit.status} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {ROLE_LABEL[unit.role] ?? "Service"}
                                                    </p>
                                                    {unit.unitPath && (
                                                        <p className="truncate text-xs text-muted-foreground">{unit.unitPath}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <StatusBadge
                                                status={unit.status}
                                                tone={UNIT_STATUS_META[unit.status].tone}
                                                label={UNIT_STATUS_META[unit.status].label}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {job.status === "COMPLETED" && result?.primaryAppId && (
                            <Button asChild className="w-full">
                                <Link href={`/apps/${result.primaryAppId}`}>Open app</Link>
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
