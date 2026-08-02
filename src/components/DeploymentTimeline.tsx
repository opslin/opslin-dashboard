"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api, ApiRequestError, type CiRunSummary, type DeploymentRecord } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { DeployMode } from "@/components/DeployModeSelector";

type TimelineState =
    | "queued"
    | "ci_running"
    | "ci_passed"
    | "ci_failed"
    | "queued_for_worker"
    | "cloning"
    | "detecting"
    | "building"
    | "deploying"
    | "health"
    | "ssl"
    | "vu_test"
    | "completed"
    | "failed";

type StageVisual = "done" | "active" | "pending" | "failed";

type TimelineStage = {
    key: TimelineState;
    label: string;
    detail: string;
};

type DeploymentTimelineProps = {
    idPrefix?: string;
    appId: string;
    deploymentId?: string;
    deployment?: DeploymentRecord | null;
    mode?: DeployMode;
    ciRun?: CiRunSummary | null;
    errorMessage?: string | null;
    poll?: boolean;
};

const stageLabels: Record<TimelineState, Omit<TimelineStage, "key">> = {
    queued: { label: "Queued", detail: "Deployment request accepted" },
    ci_running: { label: "GitHub Actions Running", detail: "Repository workflow is executing" },
    ci_passed: { label: "CI Passed", detail: "Workflow checks passed" },
    ci_failed: { label: "CI Failed", detail: "Workflow checks failed" },
    queued_for_worker: { label: "Queued for Server Worker", detail: "Deployment job is waiting for the Opslin worker" },
    cloning: { label: "Fetching source", detail: "Agent is cloning or downloading the selected release" },
    detecting: { label: "Detecting runtime", detail: "Opslin is selecting the runtime and build strategy" },
    building: { label: "Building image", detail: "Agent is building the Docker image" },
    deploying: { label: "Starting/promoting candidate", detail: "Agent is starting or promoting the candidate container" },
    health: { label: "Running health check", detail: "HTTP health endpoint is being verified" },
    ssl: { label: "Applying route / SSL", detail: "Opslin is applying routing and certificate state" },
    vu_test: { label: "Running Virtual-User Test", detail: "Synthetic traffic is validating the release" },
    completed: { label: "Deployment Complete", detail: "Release is live" },
    failed: { label: "Deployment Failed", detail: "Release did not complete" },
};

function stagesForMode(mode: DeployMode): TimelineStage[] {
    const keys: TimelineState[] = mode === "safe_with_health"
        ? ["queued", "ci_running", "ci_passed", "queued_for_worker", "cloning", "detecting", "building", "deploying", "health", "vu_test", "ssl", "completed"]
        : mode === "safe"
            ? ["queued", "ci_running", "ci_passed", "queued_for_worker", "cloning", "detecting", "building", "deploying", "health", "ssl", "completed"]
            : ["queued", "cloning", "detecting", "building", "deploying", "health", "ssl", "completed"];

    return keys.map((key) => ({ key, ...stageLabels[key] }));
}

function deploymentPhaseState(deployment?: DeploymentRecord | null): TimelineState | null {
    const progress = deployment?.queue?.progress;
    const raw = progress && typeof progress === "object"
        ? (progress.phase ?? progress.stage)
        : null;
    if (typeof raw !== "string") {
        return null;
    }
    const normalized = raw.toLowerCase();
    if (normalized === "clone" || normalized === "cloning") return "cloning";
    if (normalized === "detect" || normalized === "detecting") return "detecting";
    if (normalized === "build" || normalized === "building") return "building";
    if (normalized === "deploy" || normalized === "deploying") return "deploying";
    if (normalized === "healthcheck" || normalized === "health") return "health";
    if (normalized === "ssl") return "ssl";
    if (normalized === "completed" || normalized === "complete") return "completed";
    return null;
}

function progressLine(deployment?: DeploymentRecord | null) {
    const progress = deployment?.queue?.progress;
    const raw = progress && typeof progress === "object"
        ? (progress.description ?? progress.line)
        : null;
    return typeof raw === "string" && raw.trim() ? raw : null;
}

function activeState(deployment?: DeploymentRecord | null, ciRun?: CiRunSummary | null): TimelineState {
    if (ciRun?.status === "failed") return "ci_failed";
    if (deployment?.status === "failed" || deployment?.status === "aborted") return deploymentPhaseState(deployment) ?? "failed";
    if (deployment?.status === "succeeded" || deployment?.status === "rolled_back") return "completed";
    if (ciRun?.status === "pending") return "ci_running";
    if (ciRun?.status === "passed" && (!deployment || deployment.status === "pending")) return "queued_for_worker";
    if (deployment?.status === "running") return deploymentPhaseState(deployment) ?? "deploying";
    return "queued";
}

function stageVisual(stage: TimelineState, active: TimelineState, mode: DeployMode, failed: boolean): StageVisual {
    if (active === "ci_failed") {
        if (stage === "ci_running") return "done";
        if (stage === "ci_passed") return "failed";
        return stage === "queued" ? "done" : "pending";
    }

    const order = stagesForMode(mode).map((item) => item.key);
    const activeIndex = order.indexOf(active);
    const stageIndex = order.indexOf(stage);
    if (failed) {
        if (stageIndex < activeIndex) return "done";
        if (stageIndex === activeIndex || (activeIndex === -1 && stage === "completed")) return "failed";
        return "pending";
    }
    if (stageIndex < activeIndex) return "done";
    if (stageIndex === activeIndex) {
        return active === "completed" ? "done" : "active";
    }
    return "pending";
}

function TimelineIcon({ visual }: { visual: StageVisual }) {
    if (visual === "done") {
        return <CheckCircle2 className="h-5 w-5 text-success-text" />;
    }
    if (visual === "active") {
        return <span className="deployment-timeline-pulse h-5 w-5 rounded-full border-2 border-info bg-info/20" />;
    }
    if (visual === "failed") {
        return <XCircle className="h-5 w-5 text-danger-text" />;
    }
    return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

function queuedWorkerDetail(deployment?: DeploymentRecord | null) {
    switch (deployment?.queue?.state) {
        case "waiting":
            return "Waiting in deploy queue...";
        case "delayed":
            return "Deployment job is delayed for retry...";
        case "failed":
            return "Deployment job failed before reaching the agent.";
        case "unknown":
            return "Deployment job is missing from the queue.";
        default:
            return stageLabels.queued_for_worker.detail;
    }
}

function getApiErrorStatus(error: unknown) {
    return error instanceof ApiRequestError ? error.status : undefined;
}

export function DeploymentTimeline({
    idPrefix = "deployment-timeline",
    appId,
    deploymentId,
    deployment,
    mode = "fast",
    ciRun,
    errorMessage,
    poll,
}: DeploymentTimelineProps) {
    const shouldPoll = Boolean(poll && deploymentId);
    const terminalStatuses = new Set(["succeeded", "failed", "aborted", "rolled_back"]);

    const { data, isError, failureCount } = useQuery({
        queryKey: ["deploymentDetail", appId, deploymentId],
        queryFn: () => api.getDeploymentDetail(appId, deploymentId!),
        enabled: shouldPoll,
        refetchInterval: (query) => {
            // Stop polling once we reach a terminal state
            const status = query.state.data?.status;
            if (status && terminalStatuses.has(status)) {
                return false;
            }
            return shouldPoll ? 5_000 : false;
        },
        retry: (failureCount, error) => {
            const status = getApiErrorStatus(error);

            // Don't retry 404s more than 3 times (grace window for race condition)
            if (status === 404) {
                return failureCount < 3;
            }
            // Retry transient errors up to 3 times
            return failureCount < 3;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    });
    const detailUnavailable = isError && failureCount >= 3;
    const currentDeployment = data ?? deployment ?? null;
    const stages = useMemo(() => stagesForMode(mode), [mode]);
    const currentState = activeState(currentDeployment, ciRun);
    const deploymentFailed = currentDeployment?.status === "failed" || currentDeployment?.status === "aborted";
    const failureText = detailUnavailable
        ? "Deployment detail is not available. Check the deployment list for status."
        : errorMessage ||
        currentDeployment?.errorClassification?.summary ||
        currentDeployment?.healthLog ||
        ciRun?.failureReason ||
        null;

    return (
        <section id={`${idPrefix}-section`} className="dashboard-surface overflow-hidden">
            <div className="border-b border-border/70 px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="dashboard-section-label">Deployment Timeline</p>
                        <h2 className="mt-2 text-lg font-semibold text-foreground">Latest release path</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentDeployment
                                ? `Started ${formatRelativeTime(currentDeployment.startedAt)} · sha ${currentDeployment.sha.slice(0, 7)}`
                                : "No deployment has started yet."}
                        </p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-md bg-secondary/60">
                        {mode === "fast" ? "Fast Deploy" : mode === "safe" ? "Safe Deploy" : "Safe + Health"}
                    </Badge>
                </div>
            </div>

            <ol className="p-5">
                {stages.map((stage, index) => {
                    const visual = stageVisual(stage.key, currentState, mode, Boolean(deploymentFailed));
                    const isBlockedByCi = currentState === "ci_failed" && ["queued_for_worker", "cloning", "detecting", "building", "deploying", "health", "vu_test", "ssl", "completed"].includes(stage.key);
                    const detail = stage.key === "queued_for_worker" && currentState === "queued_for_worker"
                        ? queuedWorkerDetail(currentDeployment)
                        : visual === "active" && progressLine(currentDeployment)
                            ? progressLine(currentDeployment)!
                            : stage.key === "ci_running" && ciRun?.provider === "agent"
                                ? "Opslin's agent is running your test command on your server"
                                : stage.detail;
                    return (
                        <li
                            id={`${idPrefix}-stage-${stage.key}`}
                            key={stage.key}
                            className="grid grid-cols-[2rem_1fr] gap-4 pb-5 last:pb-0"
                        >
                            <div className="relative flex justify-center">
                                <TimelineIcon visual={visual} />
                                {index < stages.length - 1 ? (
                                    <span
                                        className={cn(
                                            "absolute top-7 h-[calc(100%+0.75rem)] w-px",
                                            visual === "done" ? "bg-success/45" : "bg-border"
                                        )}
                                    />
                                ) : null}
                            </div>
                            <div className={cn("min-w-0 rounded-md border px-4 py-3", visual === "active"
                                ? "border-info/30 bg-info/10"
                                : visual === "failed"
                                    ? "border-danger/30 bg-danger/10"
                                    : "border-border/70 bg-card/50",
                                isBlockedByCi ? "opacity-55" : ""
                            )}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">
                                        {currentState === "ci_failed" && stage.key === "ci_passed"
                                            ? "CI Failed"
                                            : stage.key === "ci_running" && ciRun?.provider === "agent"
                                                ? "Running Tests on Your Server"
                                                : stage.label}
                                    </p>
                                    {visual === "active" ? (
                                        <Badge variant="outline" className="rounded-md border-info/25 bg-info/10 text-info-text">
                                            Active
                                        </Badge>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {isBlockedByCi ? "Blocked until CI passes" : detail}
                                </p>
                                {visual === "failed" && failureText ? (
                                    <p className="mt-2 text-sm text-danger-text">{failureText}</p>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
