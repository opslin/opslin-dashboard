"use client";

import { useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    CheckCircle2,
    Circle,
    Clock,
    Copy,
    ExternalLink,
    FileText,
    Loader2,
    PlugZap,
    RefreshCw,
    RotateCcw,
    SkipForward,
    Terminal,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DeployModeSelector, type DeployMode } from "@/components/DeployModeSelector";
import { DeploymentCheckReportCard } from "@/components/DeploymentCheckReportCard";
import { DeploymentTimeline } from "@/components/DeploymentTimeline";
import { DeployLiveView } from "@/components/deploy/live/deploy-live-view";
import { SafeDeploySetupWizard } from "@/components/SafeDeploySetupWizard";
import { ErrorCard } from "@/components/apps/error-card";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt as PlanUpgradePrompt } from "@/components/UpgradePrompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { App, CiRunSummary, DeployGateSummary, DeployErrorClassification, DeploymentCheckReport, DeploymentRecord, Server } from "@/lib/api";
import { deploymentBadgeClass, formatDeploymentStatus, shortSha } from "../app-helpers";
import { cn, formatRelativeTime } from "@/lib/utils";
import { isLockBusyDeployment, selectCurrentDeploymentTruth } from "@/lib/deployment-selectors";

const INITIAL_DEPLOYMENT_COUNT = 5;
type DeploymentLiveStatus = "connecting" | "connected" | "reconnecting" | "polling" | "closed";

type DeploymentsSectionProps = {
    app: App;
    server: Pick<Server, "id" | "name" | "status" | "isLiveConnected">;
    appId: string;
    deployments: DeploymentRecord[];
    activeDeployGate?: DeployGateSummary | null;
    deployGatesLoading: boolean;
    currentDeployMode: DeployMode;
    repoFullName: string;
    latestDeployment?: DeploymentRecord | null;
    latestCheckReport?: DeploymentCheckReport | null;
    deployErrorClassification?: DeployErrorClassification | null;
    deployErrorRaw?: string | null;
    liveStatus: DeploymentLiveStatus;
    liveLastEventAt?: string | null;
    pollingFallback: boolean;
    appUrl?: string | null;
    deployPending: boolean;
    rollbackPending: boolean;
    deleteLocked: boolean;
    onDeploy: () => void;
    onViewLogs: () => void;
    onRollback: (sha: string) => void;
    onSetupComplete: () => void;
    // Optional one-click env-var fix wired through to the parent. The
    // parent owns merging the patch into existing env vars and triggering
    // the redeploy so the section stays presentation-only. A `null`
    // value in the patch means the parent should delete the key.
    onApplyEnvFix?: (envPatch: Record<string, string | null>) => void;
    quickFixPending?: boolean;
};

function canRollbackDeployment(
    app: App,
    deployment: DeploymentRecord,
    currentDeployment: DeploymentRecord | null | undefined,
    deleteLocked: boolean
) {
    return ["succeeded", "rolled_back"].includes(deployment.status)
        && deployment.id !== currentDeployment?.id
        && deployment.sha !== currentDeployment?.sha
        && app.status !== "deploying"
        && !deleteLocked;
}

const phaseLabels: Record<string, string> = {
    clone: "Fetching source",
    cloning: "Fetching source",
    detect: "Detecting runtime",
    detecting: "Detecting runtime",
    build: "Building image",
    building: "Building image",
    deploy: "Starting/promoting candidate",
    deploying: "Starting/promoting candidate",
    healthcheck: "Running health check",
    health: "Running health check",
    ssl: "Applying route / SSL",
    completed: "Deployment complete",
    complete: "Deployment complete",
    dispatching: "Worker accepted job",
    running: "Waiting for agent result",
    queued: "Queued on Server",
    failed: "Deployment failed",
};

const helperCopy: Record<string, string> = {
    ci_blocked: "Deploy blocked by CI; old version is still running.",
    queued: "Another deployment is currently building on this server. This deployment will continue automatically when the server is free. No action needed.",
    cloning: "Opslin is fetching the source for this deployment attempt.",
    detecting: "Opslin is detecting the runtime and build strategy for the app.",
    building: "Opslin is building the Docker image from the selected commit.",
    deploying: "The agent is starting or promoting the candidate container.",
    health: "Health check is verifying that the app responds before traffic is promoted.",
    ssl: "Opslin is applying the public route and SSL state for the release.",
    completed: "The release is live and the dashboard has received the terminal result.",
    dispatching: "The server worker accepted the job and is preparing the agent request.",
    running: "The worker is waiting for the agent to finish the deployment job.",
    pending: "The deployment request is queued and waiting for the next pipeline step.",
    failed: "The latest attempt failed. Review the failed stage and retry after applying the suggested fix.",
    lock_busy: "Another deploy is already running, so this duplicate request was skipped.",
};

function progressRecord(deployment?: DeploymentRecord | null) {
    const progress = deployment?.queue?.progress;
    return progress && typeof progress === "object" ? progress : null;
}

function progressPhase(deployment?: DeploymentRecord | null) {
    const progress = progressRecord(deployment);
    const raw = progress?.stage ?? progress?.phase;
    return typeof raw === "string" ? raw.toLowerCase() : null;
}

function isServerQueuedDeployment(deployment?: DeploymentRecord | null) {
    return progressPhase(deployment) === "queued" &&
        deployment?.status !== "failed" &&
        deployment?.status !== "aborted";
}

function progressLine(deployment?: DeploymentRecord | null) {
    const progress = progressRecord(deployment);
    const raw = progress?.description ?? progress?.line;
    if (typeof raw === "string" && raw.trim()) {
        return summarizeDeploymentMessage(raw);
    }
    return summarizeDeploymentMessage(deployment?.healthLog);
}

function summarizeDeploymentMessage(raw?: string | null) {
    if (!raw) return null;
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^#\d+\s/.test(line));
    const latest = lines.at(-1) || raw.trim();
    if (!latest) return null;
    return latest.length > 260 ? `${latest.slice(0, 257).trimEnd()}...` : latest;
}

function progressPercent(deployment?: DeploymentRecord | null) {
    if (!deployment) return 0;
    const progress = progressRecord(deployment);
    const raw = progress?.percentage ?? progress?.percent;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.min(100, Math.max(0, Math.round(raw)));
    }
    if (deployment.status === "succeeded" || deployment.status === "rolled_back") return 100;
    return 0;
}

function elapsedLabel(deployment?: DeploymentRecord | null) {
    if (!deployment) return "No deploy";
    const start = new Date(deployment.startedAt).getTime();
    const end = deployment.finishedAt ? new Date(deployment.finishedAt).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown";
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function sourceLabel(deployment?: DeploymentRecord | null) {
    switch (deployment?.triggeredBy) {
        case "webhook":
        case "github_webhook":
        case "safe_deploy_gate":
            return "GitHub push";
        case "rollback":
            return "Rollback";
        case "manual":
            return deployment?.attemptNumber && deployment.attemptNumber > 1 ? "Retry" : "Manual deploy";
        default:
            return deployment?.triggeredBy || "Not started";
    }
}

function ciStatus(ciRun?: CiRunSummary | null) {
    return typeof ciRun?.status === "string" ? ciRun.status.toLowerCase() : null;
}

function ciRunHasDeploymentAttempt(
    ciRun: CiRunSummary,
    deployments: DeploymentRecord[]
) {
    return Boolean(ciRun.deploymentId) ||
        deployments.some((deployment) =>
            deployment.id === ciRun.deploymentId ||
            deployment.triggerMeta?.ciRunId === ciRun.id ||
            (
                ciStatus(ciRun) !== "failed" &&
                deployment.triggeredBy === "safe_deploy_gate" &&
                deployment.sha === ciRun.commitSha
            )
        );
}

function getCiOnlyRuns(
    gate: DeployGateSummary | null | undefined,
    deployments: DeploymentRecord[]
) {
    const runs = [
        ...(gate?.recentCiRuns ?? []),
        ...(gate?.lastCiRun ? [gate.lastCiRun] : []),
    ];
    const seen = new Set<string>();
    const unique = runs
        .filter((ciRun): ciRun is CiRunSummary => Boolean(ciRun?.id))
        .filter((ciRun) => {
            if (seen.has(ciRun.id)) {
                return false;
            }
            seen.add(ciRun.id);
            return true;
        })
        .filter((ciRun) =>
            ciStatus(ciRun) !== "passed" &&
            !ciRun.deploymentId &&
            !ciRunHasDeploymentAttempt(ciRun, deployments)
        );
    const byCommit = new Map<string, CiRunSummary>();
    const statusRank = (ciRun: CiRunSummary) => ciStatus(ciRun) === "failed" ? 3 : ciStatus(ciRun) === "pending" ? 2 : 1;
    for (const ciRun of unique.sort((left, right) => ciRunTimeMillis(right) - ciRunTimeMillis(left))) {
        const key = ciRun.commitSha || ciRun.runId || ciRun.id;
        const existing = byCommit.get(key);
        if (!existing) {
            byCommit.set(key, ciRun);
            continue;
        }
        if (
            statusRank(ciRun) > statusRank(existing) ||
            (statusRank(ciRun) === statusRank(existing) && ciRunTimeMillis(ciRun) > ciRunTimeMillis(existing))
        ) {
            byCommit.set(key, ciRun);
        }
    }
    return [...byCommit.values()].sort((left, right) => ciRunTimeMillis(right) - ciRunTimeMillis(left));
}

function getBlockedCiRun(
    gate: DeployGateSummary | null | undefined,
    deployments: DeploymentRecord[],
    currentDeployment?: DeploymentRecord | null
) {
    const currentTime = currentDeployment ? deploymentHistoryTimeMillis(currentDeployment) : 0;
    return getCiOnlyRuns(gate, deployments).find((ciRun) =>
        ciStatus(ciRun) === "failed" && (!currentTime || ciRunTimeMillis(ciRun) > currentTime)
    ) ?? null;
}

function getLatestRealAttempt(deployments: DeploymentRecord[], latestDeployment?: DeploymentRecord | null) {
    const ordered = [
        ...(latestDeployment ? [latestDeployment] : []),
        ...deployments,
    ];
    const seen = new Set<string>();
    return ordered.find((deployment) => {
        if (!deployment || seen.has(deployment.id)) return false;
        seen.add(deployment.id);
        return !isLockBusyDeployment(deployment);
    }) ?? null;
}

function getLiveRelease(deployments: DeploymentRecord[], latestDeployment?: DeploymentRecord | null) {
    const ordered = [
        ...(latestDeployment ? [latestDeployment] : []),
        ...deployments,
    ];
    const seen = new Set<string>();
    return ordered.find((deployment) => {
        if (!deployment || seen.has(deployment.id)) return false;
        seen.add(deployment.id);
        return !isLockBusyDeployment(deployment) && ["succeeded", "rolled_back"].includes(deployment.status);
    }) ?? null;
}

function ciRunTime(ciRun?: CiRunSummary | null) {
    return ciRun?.finishedAt || ciRun?.startedAt || ciRun?.createdAt || null;
}

function ciRunTimeMillis(ciRun?: CiRunSummary | null) {
    const raw = ciRunTime(ciRun);
    const millis = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(millis) ? millis : 0;
}

function ciRunFailureMessage(ciRun?: CiRunSummary | null) {
    if (ciRun?.failureReason) {
        return ciRun.failureReason;
    }
    return ciRun?.provider === "agent"
        ? "The test command failed before Opslin started a deployment."
        : "GitHub Actions failed before Opslin started a deployment.";
}

function deploymentHistoryTimeMillis(deployment: DeploymentRecord) {
    const raw = deployment.finishedAt || deployment.startedAt;
    const millis = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(millis) ? millis : 0;
}

function ciRunBadgeText(ciRun: CiRunSummary) {
    const status = ciStatus(ciRun);
    if (status === "failed") return "CI FAILED";
    if (status === "pending") return "CI RUNNING";
    return `CI ${status?.toUpperCase() || "UNKNOWN"}`;
}

function ciRunFailureCopy(ciRun: CiRunSummary) {
    if (ciStatus(ciRun) === "pending") {
        return "CI is still running. Opslin will deploy only after the workflow passes.";
    }
    return ciRunFailureMessage(ciRun);
}

function isHealthFailureClassification(classification?: DeployErrorClassification | null) {
    return Boolean(classification?.category?.startsWith("HEALTH_"));
}

function triggerMetaString(deployment: DeploymentRecord | null | undefined, key: string) {
    const value = deployment?.triggerMeta?.[key];
    return typeof value === "string" && value.trim() ? value : null;
}

function healthFailureMessage(deployment: DeploymentRecord | null | undefined, classification: DeployErrorClassification) {
    const message = triggerMetaString(deployment, "healthFailureMessage");
    if (message && message !== classification.suggestion) {
        return message;
    }
    return null;
}

function healthFailureExitCode(deployment: DeploymentRecord | null | undefined, classification: DeployErrorClassification) {
    const fromMeta = deployment?.triggerMeta?.healthFailureExitCode ?? deployment?.triggerMeta?.exitCode;
    if (typeof fromMeta === "number" && Number.isFinite(fromMeta)) {
        return String(fromMeta);
    }
    if (typeof fromMeta === "string" && /^\d+$/.test(fromMeta.trim())) {
        return fromMeta.trim();
    }

    const text = [classification.logSnippet, deployment?.healthLog].filter(Boolean).join("\n");
    const match = text.match(/exitCode=([0-9]+)|exit\s+code\s+([0-9]+)/i);
    return match?.[1] || match?.[2] || null;
}

function HealthFailureDetails({
    classification,
    deployment,
}: {
    classification: DeployErrorClassification;
    deployment?: DeploymentRecord | null;
}) {
    const agentMessage = healthFailureMessage(deployment, classification);
    const exitCode = healthFailureExitCode(deployment, classification);

    return (
        <div className="mt-3 rounded-lg border border-danger/30 bg-card/75 p-3 text-sm text-foreground">
            <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-danger/30 bg-danger-muted font-mono text-[11px] text-danger-text">
                    {classification.category}
                </Badge>
                {exitCode ? (
                    <Badge variant="outline" className="border-danger/30 bg-card text-danger-text">
                        Exit Code: {exitCode}
                    </Badge>
                ) : null}
            </div>
            {agentMessage ? (
                <p className="mt-2 text-danger-text">{agentMessage}</p>
            ) : null}
            {classification.logSnippet ? (
                <details open className="mt-3">
                    <summary className="cursor-pointer font-medium text-danger-text">Container Logs</summary>
                    <pre className="mt-2 max-h-44 overflow-auto rounded-md bg-inverse p-3 font-mono text-xs leading-5 text-text-on-inverse-muted">
                        {classification.logSnippet}
                    </pre>
                </details>
            ) : null}
        </div>
    );
}

function statusLabel(deployment?: DeploymentRecord | null, ciRun?: DeployGateSummary["lastCiRun"] | null) {
    if (ciRun?.status === "pending") return "CI running";
    if (ciRun?.status === "failed") return "CI failed";
    if (!deployment) return "No deployment";
    if (isLockBusyDeployment(deployment)) return "Skipped (lock busy)";
    if (isServerQueuedDeployment(deployment)) return "Queued on Server";
    if (deployment.status === "pending") {
        if (deployment.queue?.state === "waiting") return "Worker queued";
        if (deployment.queue?.state === "active") return "Worker active";
        return "Queued";
    }
    if (deployment.status === "running") return phaseLabels[progressPhase(deployment) || "deploying"];
    if (deployment.status === "succeeded" || deployment.status === "rolled_back") return "Succeeded";
    if (deployment.status === "aborted") return "Aborted";
    return "Failed";
}

function statusTone(deployment?: DeploymentRecord | null, ciRun?: DeployGateSummary["lastCiRun"] | null) {
    if (deployment && isLockBusyDeployment(deployment)) {
        return "border-warning/30 bg-warning-muted text-warning-text";
    }
    if (isServerQueuedDeployment(deployment)) {
        return "border-warning/30 bg-warning-muted text-warning-text";
    }
    if (ciRun?.status === "failed" || deployment?.status === "failed" || deployment?.status === "aborted") {
        return "border-danger/30 bg-danger-muted text-danger-text";
    }
    if (deployment?.status === "succeeded" || deployment?.status === "rolled_back") {
        return "border-success/30 bg-success-muted text-success-text";
    }
    if (deployment?.status === "pending" || deployment?.status === "running" || ciRun?.status === "pending") {
        return "border-info/30 bg-info-muted text-info-text";
    }
    return "border-border bg-secondary text-muted-foreground";
}

function helperKeyForDeployment(deployment: DeploymentRecord | null | undefined, failed: boolean, phase: string | null) {
    if (deployment && isLockBusyDeployment(deployment)) return "lock_busy";
    if (isServerQueuedDeployment(deployment)) return "queued";
    if (failed) return "failed";
    if (!deployment) return "pending";
    if (deployment.status === "succeeded" || deployment.status === "rolled_back") return "completed";
    if (deployment.status === "aborted") return "failed";
    return phase || deployment.status || "pending";
}

type LifecycleVisual = "done" | "active" | "pending" | "failed";

function lifecycleSteps(
    deployment: DeploymentRecord | null | undefined,
    ciRun: DeployGateSummary["lastCiRun"] | null | undefined,
    ciBlocked = false
): Array<{ key: string; label: string; visual: LifecycleVisual }> {
    if (ciBlocked) {
        const liveDone = deployment?.status === "succeeded" || deployment?.status === "rolled_back";
        return [
            { key: "github", label: "GitHub", visual: "done" },
            { key: "ci", label: "CI", visual: "failed" },
            { key: "queue", label: "Queue", visual: "pending" },
            { key: "worker", label: "Worker", visual: "pending" },
            { key: "agent", label: "Agent", visual: "pending" },
            { key: "health", label: "Health", visual: "pending" },
            { key: "ssl", label: "Route", visual: "pending" },
            { key: "live", label: "Live", visual: liveDone ? "done" : "pending" },
        ];
    }

    const phase = progressPhase(deployment);
    const status = deployment?.status;
    const failed = status === "failed" || status === "aborted" || ciRun?.status === "failed";
    const succeeded = status === "succeeded" || status === "rolled_back";
    const serverQueued = isServerQueuedDeployment(deployment);
    const isGitHub = ["webhook", "github_webhook", "safe_deploy_gate"].includes(deployment?.triggeredBy || "");
    const ciDone = Boolean(ciRun?.status === "passed" || succeeded || status === "running");
    const queueDone = Boolean(!serverQueued && (status === "running" || succeeded || ["active", "completed"].includes(deployment?.queue?.state || "")));
    const workerDone = Boolean(!serverQueued && (status === "running" || succeeded || phase));
    const agentDone = Boolean(succeeded || phase === "health" || phase === "ssl" || phase === "completed");
    const healthDone = Boolean(succeeded || phase === "ssl" || phase === "completed");
    const routeDone = Boolean(succeeded || phase === "completed");
    const failedPhase = phase || (ciRun?.status === "failed" ? "ci" : deployment?.queue?.state === "failed" ? "queue" : "live");

    const visual = (key: string, active: boolean, done: boolean): LifecycleVisual => {
        if (failed) {
            if (failedPhase === key) return "failed";
            if (done) return "done";
            return "pending";
        }
        if (done) return "done";
        if (active) return "active";
        return "pending";
    };

    return [
        { key: "github", label: "GitHub", visual: visual("github", isGitHub && !deployment, Boolean(deployment)) },
        { key: "ci", label: "CI", visual: visual("ci", ciRun?.status === "pending", ciDone) },
        { key: "queue", label: "Queue", visual: visual("queue", serverQueued || status === "pending", queueDone) },
        { key: "worker", label: "Worker", visual: visual("worker", !serverQueued && deployment?.queue?.state === "active", workerDone) },
        { key: "agent", label: "Agent", visual: visual("agent", ["cloning", "detecting", "building", "deploying", "dispatching", "running"].includes(phase || ""), agentDone) },
        { key: "health", label: "Health", visual: visual("health", phase === "health", healthDone) },
        { key: "ssl", label: "Route", visual: visual("ssl", phase === "ssl", routeDone) },
        { key: "live", label: "Live", visual: visual("live", false, succeeded) },
    ];
}

function LifecycleIcon({ visual }: { visual: LifecycleVisual }) {
    if (visual === "done") return <CheckCircle2 className="h-4 w-4 text-success-text" />;
    if (visual === "active") return <Loader2 className="h-4 w-4 animate-spin text-info-text" />;
    if (visual === "failed") return <XCircle className="h-4 w-4 text-danger-text" />;
    return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

function DeploymentCommandCenter({
    app,
    server,
    deployment,
    liveDeployment,
    ciRun,
    blockedCiRun,
    liveStatus,
    liveLastEventAt,
    pollingFallback,
    deployErrorClassification,
    deployErrorRaw,
    appUrl,
    deployPending,
    deleteLocked,
    onDeploy,
    onViewLogs,
}: {
    app: App;
    server: Pick<Server, "id" | "status" | "isLiveConnected">;
    deployment?: DeploymentRecord | null;
    liveDeployment?: DeploymentRecord | null;
    ciRun?: DeployGateSummary["lastCiRun"] | null;
    blockedCiRun?: CiRunSummary | null;
    liveStatus: DeploymentLiveStatus;
    liveLastEventAt?: string | null;
    pollingFallback: boolean;
    deployErrorClassification?: DeployErrorClassification | null;
    deployErrorRaw?: string | null;
    appUrl?: string | null;
    deployPending: boolean;
    deleteLocked: boolean;
    onDeploy: () => void;
    onViewLogs: () => void;
}) {
    const phase = progressPhase(deployment);
    const serverQueued = isServerQueuedDeployment(deployment);
    const blockedByCi = Boolean(blockedCiRun);
    const activeStage = blockedByCi ? "Deploy blocked by CI" : statusLabel(deployment, ciRun);
    const latestMessage = blockedByCi ? ciRunFailureMessage(blockedCiRun) : progressLine(deployment) || "Waiting for deployment events.";
    const percent = progressPercent(deployment);
    const deploymentFailed = Boolean(deployment && (deployment.status === "failed" || deployment.status === "aborted") && !isLockBusyDeployment(deployment));
    const failed = blockedByCi || deploymentFailed;
    const healthFailure = !blockedByCi && deploymentFailed && isHealthFailureClassification(deployErrorClassification);
    const lifecycle = lifecycleSteps(deployment, ciRun, blockedByCi);
    const helperKey = blockedByCi ? "ci_blocked" : helperKeyForDeployment(deployment, deploymentFailed, phase);
    const githubRunUrl = blockedCiRun?.runUrl ?? ciRun?.runUrl;
    const blockedRunTime = ciRunTime(blockedCiRun);
    const stableLiveDeployment = liveDeployment ?? (deployment && ["succeeded", "rolled_back"].includes(deployment.status) ? deployment : null);
    const statusCards = blockedByCi
        ? [
            ["Live SHA", stableLiveDeployment ? shortSha(stableLiveDeployment.sha) : "None"],
            ["Blocked SHA", blockedCiRun ? shortSha(blockedCiRun.commitSha) : "None"],
            ["CI/CD", "FAILED"],
            ["Queue", "NOT CREATED"],
            ["Worker", "NOT STARTED"],
            ["Agent", server.isLiveConnected === false ? "DISCONNECTED" : "CONNECTED"],
            ["Progress", "Blocked"],
            ["Last update", blockedRunTime ? formatRelativeTime(blockedRunTime) : "Waiting"],
        ]
        : deploymentFailed
        ? [
            ["Failed SHA", deployment ? shortSha(deployment.sha) : "None"],
            ["Live SHA", stableLiveDeployment ? shortSha(stableLiveDeployment.sha) : "None"],
            ["CI/CD", ciRun?.status ? ciRun.status.toUpperCase() : currentDeployModeLabel(ciRun)],
            ["Queue", deployment?.queue?.state ? deployment.queue.state.toUpperCase() : "FAILED"],
            ["Worker", deployment?.queue?.workerPickedAt ? "PICKED" : "STOPPED"],
            ["Agent", server.isLiveConnected === false ? "DISCONNECTED" : "CONNECTED"],
            ["Progress", `${percent}%`],
            ["Last update", deployment?.finishedAt ? formatRelativeTime(deployment.finishedAt) : liveLastEventAt ? formatRelativeTime(liveLastEventAt) : "Waiting"],
        ]
        : [
            ["Current SHA", deployment ? shortSha(deployment.sha) : "None"],
            ["CI/CD", ciRun?.status ? ciRun.status.toUpperCase() : currentDeployModeLabel(ciRun)],
            ["Queue", serverQueued ? "QUEUED ON SERVER" : deployment?.queue?.state ? deployment.queue.state.toUpperCase() : "NONE"],
            ["Worker", serverQueued ? "WAITING" : deployment?.queue?.workerPickedAt ? "PICKED" : deployment?.queue?.state === "active" ? "ACTIVE" : "WAITING"],
            ["Agent", server.isLiveConnected === false ? "DISCONNECTED" : "CONNECTED"],
            ["Progress", `${percent}%`],
            ["Elapsed", elapsedLabel(deployment)],
            ["Last update", liveLastEventAt ? formatRelativeTime(liveLastEventAt) : "Waiting"],
        ];
    const diagnostics = [
        `App: ${app.name} (${app.id})`,
        `Deployment: ${deployment?.id || "none"}`,
        `SHA: ${deployment?.sha || "none"}`,
        `Live release: ${stableLiveDeployment?.sha || "none"}`,
        `Blocked CI run: ${blockedCiRun?.id || "none"}`,
        `Blocked SHA: ${blockedCiRun?.commitSha || "none"}`,
        `CI failure: ${blockedCiRun ? ciRunFailureMessage(blockedCiRun) : "none"}`,
        `GitHub run: ${blockedCiRun?.runUrl || "none"}`,
        `Attempt: ${deployment?.attemptNumber || 0}`,
        `Status: ${deployment?.status || "none"}`,
        `Stage: ${activeStage}`,
        `Queue: ${deployment?.queue?.state || "none"}`,
        `Worker picked: ${deployment?.queue?.workerPickedAt || "none"}`,
        `Agent connected: ${server.isLiveConnected === false ? "no" : "yes"}`,
        `Latest message: ${latestMessage}`,
    ].join("\n");

    const copyDiagnostics = async () => {
        await navigator.clipboard?.writeText(diagnostics);
        toast.success("Diagnostics copied");
    };

    return (
        <section className="dashboard-surface overflow-hidden" data-testid="deployment-command-center">
            <div className="border-b border-border/70 px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="dashboard-section-label">Deployment Command Center</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold text-foreground">Current release truth</h2>
                            <Badge variant="outline" className={cn("rounded-md", statusTone(deployment, blockedByCi ? blockedCiRun : ciRun))}>
                                {activeStage}
                            </Badge>
                            <Badge variant="outline" className="rounded-md">
                                <PlugZap className="mr-1 h-3.5 w-3.5" />
                                {pollingFallback ? "Polling fallback" : liveStatus === "connected" ? "Live" : "Reconnecting"}
                            </Badge>
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                            {blockedByCi
                                ? stableLiveDeployment
                                    ? `Deploy blocked by CI; old version is still running at ${shortSha(stableLiveDeployment.sha)}.`
                                    : "Deploy blocked by CI before any server release changed."
                                : deploymentFailed
                                ? stableLiveDeployment
                                    ? `Latest candidate ${deployment ? shortSha(deployment.sha) : ""} failed; previous live release is still running at ${shortSha(stableLiveDeployment.sha)}.`
                                    : `Latest candidate ${deployment ? shortSha(deployment.sha) : ""} failed before any live release changed.`
                                : deployment
                                ? `${shortSha(deployment.sha)} · ${sourceLabel(deployment)} · started ${formatRelativeTime(deployment.startedAt)}`
                                : "No deployment attempt has been recorded yet."}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={onDeploy} disabled={deployPending || deleteLocked} size="sm">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry Deploy
                        </Button>
                        <Button variant="outline" onClick={onViewLogs} size="sm">
                            <FileText className="mr-2 h-4 w-4" />
                            View Live Logs
                        </Button>
                        <Button variant="outline" onClick={copyDiagnostics} size="sm">
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Diagnostics
                        </Button>
                        {appUrl ? (
                            <Button variant="outline" asChild size="sm">
                                <a href={appUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open App URL
                                </a>
                            </Button>
                        ) : null}
                        {githubRunUrl ? (
                            <Button variant="outline" asChild size="sm">
                                <a href={githubRunUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    View GitHub Run
                                </a>
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {statusCards.map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-border/70 bg-secondary/25 p-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                                <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-lg border border-border/70 bg-background p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">Lifecycle</p>
                            <span className="text-xs text-muted-foreground">GitHub &gt; CI &gt; Queue &gt; Worker &gt; Agent &gt; Health &gt; Route &gt; Live</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
                            {lifecycle.map((step) => (
                                <div
                                    key={step.key}
                                    className={cn(
                                        "flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                                        step.visual === "done" && "border-success/30 bg-success-muted text-success-text",
                                        step.visual === "active" && "border-info/30 bg-info-muted text-info-text",
                                        step.visual === "failed" && "border-danger/30 bg-danger-muted text-danger-text",
                                        step.visual === "pending" && "border-border/70 bg-card text-muted-foreground"
                                    )}
                                >
                                    <LifecycleIcon visual={step.visual} />
                                    <span className="font-medium">{step.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-background p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold text-foreground">Latest message</p>
                        </div>
                        <p className="break-words text-sm text-muted-foreground">{latestMessage}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={cn(
                        "rounded-lg border p-4",
                        failed ? "border-danger/30 bg-danger-muted" : "border-border/70 bg-background"
                    )}>
                        <p className="text-sm font-semibold text-foreground">What is happening?</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {blockedByCi && !stableLiveDeployment
                                ? "Deploy blocked by CI before server deployment. No live release was changed."
                                : helperCopy[helperKey] || helperCopy.pending}
                        </p>
                    </div>
                    {failed ? (
                        <div className="rounded-lg border border-danger/30 bg-danger-muted p-4">
                            <div className="flex items-center gap-2 text-danger-text">
                                <AlertTriangle className="h-4 w-4" />
                                <p className="text-sm font-semibold">
                                    {blockedByCi ? "Safe Deploy blocked" : healthFailure ? deployErrorClassification?.title : "Failure details"}
                                </p>
                            </div>
                            <p className="mt-2 text-sm text-danger/80">
                                {blockedByCi
                                    ? ciRunFailureMessage(blockedCiRun)
                                    : deployErrorClassification?.summary || deployment?.healthLog || "The latest deployment attempt failed."}
                            </p>
                            {blockedByCi ? (
                                <p className="mt-2 text-sm text-danger/80">
                                    Opslin did not create a deployment attempt for this commit, so the previous live release was not changed.
                                </p>
                            ) : null}
                            {deployErrorClassification?.suggestion ? (
                                <p className="mt-2 text-sm text-danger-text">
                                    <span className="font-semibold">Suggested fix: </span>
                                    {deployErrorClassification.suggestion}
                                </p>
                            ) : null}
                            {healthFailure && deployErrorClassification ? (
                                <HealthFailureDetails
                                    classification={deployErrorClassification}
                                    deployment={deployment}
                                />
                            ) : null}
                            {deployErrorRaw ? (
                                <details className="mt-3 text-xs text-danger-text">
                                    <summary className="cursor-pointer font-medium">View Raw Error / Raw Logs</summary>
                                    <pre className="mt-2 max-h-44 overflow-auto rounded-md bg-inverse p-3 font-mono text-text-on-inverse-muted">{deployErrorRaw}</pre>
                                </details>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function currentDeployModeLabel(ciRun?: DeployGateSummary["lastCiRun"] | null) {
    return ciRun ? "PENDING" : "FAST";
}

export function DeploymentsSection({
    app,
    server,
    appId,
    deployments,
    activeDeployGate,
    deployGatesLoading,
    currentDeployMode,
    repoFullName,
    latestDeployment,
    latestCheckReport,
    deployErrorClassification,
    deployErrorRaw,
    liveStatus,
    liveLastEventAt,
    pollingFallback,
    appUrl,
    deployPending,
    rollbackPending,
    deleteLocked,
    onDeploy,
    onViewLogs,
    onRollback,
    onSetupComplete,
    onApplyEnvFix,
    quickFixPending,
}: DeploymentsSectionProps) {
    const [showAllDeployments, setShowAllDeployments] = useState(false);
    const ciRun = activeDeployGate?.lastCiRun ?? null;
    const ciOnlyRuns = getCiOnlyRuns(activeDeployGate, deployments);
    const latestRealAttempt = getLatestRealAttempt(deployments, latestDeployment);
    const liveRelease = getLiveRelease(deployments, latestDeployment);
    const fallbackTruthDeployment = selectCurrentDeploymentTruth(deployments, ciRun) ?? latestDeployment ?? null;
    const blockedCiRun = getBlockedCiRun(activeDeployGate, deployments, liveRelease ?? latestRealAttempt ?? fallbackTruthDeployment);
    const truthDeployment = blockedCiRun
        ? liveRelease ?? fallbackTruthDeployment
        : latestRealAttempt ?? fallbackTruthDeployment;
    const truthFailed = Boolean(
        !blockedCiRun &&
        truthDeployment &&
        (truthDeployment.status === "failed" || truthDeployment.status === "aborted") &&
        !isLockBusyDeployment(truthDeployment)
    );
    const truthErrorClassification = truthFailed
        ? truthDeployment?.errorClassification ?? deployErrorClassification ?? null
        : null;
    const truthErrorRaw = truthFailed
        ? truthDeployment?.healthLog || deployErrorRaw || null
        : null;
    const report = truthDeployment?.checkReport ?? latestCheckReport ?? null;
    const historyItems = [
        ...deployments.map((deployment) => ({
            id: `deployment:${deployment.id}`,
            kind: "deployment" as const,
            deployment,
            time: deploymentHistoryTimeMillis(deployment),
        })),
        ...ciOnlyRuns.map((ciRun) => ({
            id: `ci:${ciRun.id}`,
            kind: "ci" as const,
            ciRun,
            time: ciRunTimeMillis(ciRun),
        })),
    ].sort((left, right) => right.time - left.time);
    const visibleHistoryItems = showAllDeployments
        ? historyItems
        : historyItems.slice(0, INITIAL_DEPLOYMENT_COUNT);
    const rollbackCurrentDeployment = liveRelease ?? truthDeployment;
    const rollbackAvailable = deployments.some((deployment) =>
        canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked)
    );
    const showDeployError = Boolean(truthErrorClassification || truthErrorRaw);

    return (
        <section className="space-y-6">
            <DeploymentCommandCenter
                app={app}
                server={server}
                deployment={truthDeployment}
                liveDeployment={liveRelease}
                ciRun={blockedCiRun ?? ciRun}
                blockedCiRun={blockedCiRun}
                liveStatus={liveStatus}
                liveLastEventAt={liveLastEventAt}
                pollingFallback={pollingFallback}
                deployErrorClassification={truthErrorClassification}
                deployErrorRaw={truthErrorRaw}
                appUrl={appUrl}
                deployPending={deployPending}
                deleteLocked={deleteLocked}
                onDeploy={onDeploy}
                onViewLogs={onViewLogs}
            />

            {/* Unified deploy live view (doc 04 §2) — real phase_progress timeline,
                context rail, and log excerpt. Replaces the old SVG beam-and-particle
                panel. Only renders when there's an active or recent deployment. */}
            {truthDeployment?.id && (
                <DeployLiveView
                    mode="inline"
                    appId={app.id}
                    deploymentId={truthDeployment.id}
                    appName={app.name}
                    appDomain={app.domain ?? app.primaryDomain ?? appUrl}
                    serverName={server.name}
                    serverConnected={server.isLiveConnected}
                    logs={app.deployLogs}
                    onRetry={onDeploy}
                    onRollback={
                        truthDeployment.previousSha
                            ? () => onRollback(truthDeployment.previousSha as string)
                            : undefined
                    }
                    rollbackAvailable={rollbackAvailable && Boolean(truthDeployment.previousSha)}
                    rollbackPending={rollbackPending}
                />
            )}

            <DeployModeSelector
                idPrefix={`deploy-mode-${app.id}`}
                appId={app.id}
                branch={app.branch || "main"}
                repoFullName={repoFullName}
                currentMode={currentDeployMode}
                hasSafeDeployGate={Boolean(activeDeployGate)}
                onSetupComplete={onSetupComplete}
            />

            {activeDeployGate ? (
                <SafeDeploySetupWizard
                    idPrefix={`safe-deploy-${app.id}`}
                    app={app}
                    gate={activeDeployGate}
                    loading={deployGatesLoading}
                />
            ) : null}

            {showDeployError ? (
                <ErrorCard
                    classification={truthErrorClassification}
                    rawError={truthErrorRaw}
                    onRetry={onDeploy}
                    retryDisabled={deployPending || deleteLocked}
                    onApplyEnvFix={onApplyEnvFix}
                    quickFixPending={quickFixPending}
                />
            ) : null}

            <DeploymentTimeline
                idPrefix={`deployment-timeline-${app.id}`}
                appId={app.id}
                deploymentId={blockedCiRun ? undefined : truthDeployment?.id}
                deployment={blockedCiRun ? null : truthDeployment}
                mode={currentDeployMode}
                ciRun={blockedCiRun ?? ciRun}
                errorMessage={blockedCiRun
                    ? ciRunFailureMessage(blockedCiRun)
                    : truthErrorClassification?.summary ?? truthDeployment?.healthLog ?? null}
                poll={Boolean(!blockedCiRun && truthDeployment && ["pending", "running"].includes(truthDeployment.status))}
            />

            <DeploymentCheckReportCard
                idPrefix={`deployment-check-report-${app.id}`}
                report={report}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Deployment History</CardTitle>
                    <CardDescription>
                        Recent versions, rollback targets, and rollout outcomes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {historyItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No deployments recorded yet.</p>
                    ) : (
                        <>
                            {visibleHistoryItems.map((item) => {
                                if (item.kind === "ci") {
                                    const ciRun = item.ciRun;
                                    const failedCi = ciStatus(ciRun) === "failed";
                                    return (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between",
                                                failedCi ? "border-danger/30 bg-danger-muted" : "border-info/30 bg-info-muted"
                                            )}
                                        >
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <code className={cn(
                                                        "rounded px-2 py-1 text-sm font-semibold",
                                                        failedCi ? "bg-danger-muted text-danger-text" : "bg-info-muted text-info-text"
                                                    )}>
                                                        {shortSha(ciRun.commitSha)}
                                                    </code>
                                                    <Badge className={cn(
                                                        "border",
                                                        failedCi
                                                            ? "border-danger/30 bg-danger-muted text-danger-text"
                                                            : "border-info/30 bg-info-muted text-info-text"
                                                    )}>
                                                        {ciRunBadgeText(ciRun)}
                                                    </Badge>
                                                    <Badge variant="outline" className={cn(
                                                        "bg-card/70",
                                                        failedCi ? "border-danger/30 text-danger-text" : "border-info/30 text-info-text"
                                                    )}>
                                                        Deploy blocked
                                                    </Badge>
                                                    {liveRelease ? (
                                                        <Badge variant="outline" className="border-success/30 bg-success-muted text-success-text">
                                                            Old version still running
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <p className={cn(
                                                    "text-sm font-medium",
                                                    failedCi ? "text-danger-text" : "text-info-text"
                                                )}>
                                                    {failedCi
                                                        ? liveRelease
                                                            ? "Deploy blocked by CI; old version is still running."
                                                            : "Deploy blocked by CI before any server release changed."
                                                        : "Deploy is waiting for CI before any server changes are made."}
                                                </p>
                                                <p className={cn(
                                                    "text-sm",
                                                    failedCi ? "text-danger/80" : "text-info/80"
                                                )}>
                                                    {ciRunFailureCopy(ciRun)}
                                                    {ciRunTime(ciRun) ? ` · ${formatRelativeTime(ciRunTime(ciRun)!)}`
                                                        : ""}
                                                </p>
                                            </div>
                                            {ciRun.runUrl ? (
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={ciRun.runUrl} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="mr-2 h-4 w-4" />
                                                        View GitHub Run
                                                    </a>
                                                </Button>
                                            ) : null}
                                        </div>
                                    );
                                }

                                const deployment = item.deployment;
                                const canRollback = canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked);
                                const isCurrentTruth = deployment.id === rollbackCurrentDeployment?.id;
                                const isNewestAttempt = deployment.id === deployments[0]?.id;
                                const isSkippedDuplicate = isLockBusyDeployment(deployment);
                                const isQueuedOnServer = isServerQueuedDeployment(deployment);

                                return (
                                    <div
                                        key={deployment.id}
                                        className={cn(
                                            "flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between",
                                            isCurrentTruth
                                                ? "border-inverse bg-muted/40"
                                                : isQueuedOnServer
                                                    ? "border-warning/30 bg-warning-muted/40"
                                                    : "border-border"
                                        )}
                                    >
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <code className="rounded bg-muted px-2 py-1 text-sm font-semibold text-foreground">
                                                    {shortSha(deployment.sha)}
                                                </code>
                                                <Badge className={deploymentBadgeClass(deployment.status)}>
                                                    {formatDeploymentStatus(deployment.status)}
                                                </Badge>
                                                {isSkippedDuplicate ? (
                                                    <Badge className="bg-warning-muted text-warning-text border border-warning/30">
                                                        <SkipForward className="mr-1 h-3 w-3" />
                                                        Skipped
                                                    </Badge>
                                                ) : null}
                                                {isQueuedOnServer ? (
                                                    <Badge className="border border-warning/30 bg-warning-muted text-warning-text">
                                                        <Clock className="mr-1 h-3 w-3" />
                                                        Queued on Server
                                                    </Badge>
                                                ) : null}
                                                {isCurrentTruth ? (
                                                    <Badge className="bg-inverse text-text-inverse">
                                                        Current
                                                    </Badge>
                                                ) : isNewestAttempt && !isSkippedDuplicate ? (
                                                    <Badge variant="outline" className="border-border text-muted-foreground">
                                                        Newest attempt
                                                    </Badge>
                                                ) : null}
                                                <Badge
                                                    variant="outline"
                                                    className="border-border font-mono text-xs text-muted-foreground"
                                                    data-testid="buildpack-badge"
                                                >
                                                    {deployment.buildpackName && deployment.buildpackVersion
                                                        ? `${deployment.buildpackName}@${deployment.buildpackVersion}`
                                                        : "—"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                Triggered by {deployment.triggeredBy} · started {formatRelativeTime(deployment.startedAt)}
                                                {deployment.finishedAt ? ` · finished ${formatRelativeTime(deployment.finishedAt)}` : ""}
                                            </p>
                                            {deployment.attemptNumber && deployment.attemptNumber > 1 ? (
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    {deployment.retryOfDeploymentId ? `Retry attempt #${deployment.attemptNumber}` : "Same commit redeployed"}
                                                </p>
                                            ) : null}
                                            {isSkippedDuplicate ? (
                                                <p className="text-xs font-medium text-warning-text">
                                                    Another deployment was already running
                                                </p>
                                            ) : null}
                                            {isQueuedOnServer ? (
                                                <p className="text-xs font-medium text-warning-text">
                                                    Another deployment is currently building on this server. This deployment will continue automatically.
                                                </p>
                                            ) : null}
                                            {deployment.previousSha && deployment.previousSha !== deployment.sha ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Previous version: {shortSha(deployment.previousSha)}
                                                </p>
                                            ) : null}
                                            {deployment.healthLog ? (
                                                <details className="text-xs text-muted-foreground">
                                                    <summary className="cursor-pointer font-medium">Health log preview</summary>
                                                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap">{deployment.healthLog}</p>
                                                </details>
                                            ) : null}
                                            {deployment.status === "failed" && isHealthFailureClassification(deployment.errorClassification) && deployment.errorClassification ? (
                                                <HealthFailureDetails
                                                    classification={deployment.errorClassification}
                                                    deployment={deployment}
                                                />
                                            ) : null}
                                        </div>
                                        {canRollback ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onRollback(deployment.sha)}
                                                disabled={rollbackPending}
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                {rollbackPending ? "Rolling Back..." : "Rollback"}
                                            </Button>
                                        ) : null}
                                    </div>
                                );
                            })}
                            {historyItems.length > INITIAL_DEPLOYMENT_COUNT && !showAllDeployments ? (
                                <Button type="button" variant="outline" onClick={() => setShowAllDeployments(true)}>
                                    Show all deployments ({historyItems.length - INITIAL_DEPLOYMENT_COUNT} older hidden)
                                </Button>
                            ) : null}
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Actions</CardTitle>
                    <CardDescription>Manage deployment recovery and support tools.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    <Button
                        variant="outline"
                        onClick={onDeploy}
                        disabled={deployPending || deleteLocked}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Redeploy
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const target = deployments.find((deployment) =>
                                canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked)
                            );
                            if (target) {
                                onRollback(target.sha);
                            }
                        }}
                        disabled={deleteLocked || rollbackPending || !rollbackAvailable}
                    >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {rollbackPending ? "Rolling Back..." : "Rollback"}
                    </Button>
                    <Button variant="outline" onClick={onViewLogs}>
                        <FileText className="h-4 w-4 mr-2" />
                        View Logs
                    </Button>
                    <PlanGate
                        feature="server.terminal"
                        fallback={<PlanUpgradePrompt feature="server.terminal" compact />}
                    >
                        <Button variant="outline" asChild>
                            <Link href={`/terminal?server=${server.id}`}>
                                <Terminal className="h-4 w-4 mr-2" />
                                Terminal
                            </Link>
                        </Button>
                    </PlanGate>
                </CardContent>
            </Card>
        </section>
    );
}
