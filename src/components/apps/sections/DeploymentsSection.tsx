"use client";

import { useState } from "react";
import {
    CheckCircle2,
    ChevronDown,
    Clock,
    ExternalLink,
    FileText,
    GitBranch,
    Loader2,
    MoreHorizontal,
    RefreshCw,
    RotateCcw,
    Rocket,
    SkipForward,
    XCircle,
} from "lucide-react";
import { DeployModeSelector, type DeployMode } from "@/components/DeployModeSelector";
import { DeploymentCheckReportCard } from "@/components/DeploymentCheckReportCard";
import { DeployLiveView } from "@/components/deploy/live/deploy-live-view";
import { SafeDeploySetupWizard } from "@/components/SafeDeploySetupWizard";
import { DeployFailedCard, DeploymentDrawer, deployActor, deployTitle, durationLabel, progressPhase } from "@/components/apps/deploy-ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { App, CiRunSummary, DeployGateSummary, DeployErrorClassification, DeploymentCheckReport, DeploymentRecord, Server } from "@/lib/api";
import { shortSha } from "../app-helpers";

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

function isServerQueuedDeployment(deployment?: DeploymentRecord | null) {
    return progressPhase(deployment) === "queued" && deployment?.status !== "failed" && deployment?.status !== "aborted";
}

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

export function DeploymentsSection({
    app,
    server,
    deployments,
    activeDeployGate,
    deployGatesLoading,
    currentDeployMode,
    repoFullName,
    latestDeployment,
    latestCheckReport,
    deployErrorClassification,
    deployErrorRaw,
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

    const [drawerId, setDrawerId] = useState<string | null>(null);
    const drawerDeployment = deployments.find((deployment) => deployment.id === drawerId) ?? null;
    const [modeOpen, setModeOpen] = useState(false);

    return (
        <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Deployments</h2>
                    <p className="text-sm text-muted-foreground">Every time you deploy, it shows up here.</p>
                </div>
                <Button size="lg" onClick={onDeploy} disabled={deployPending || deleteLocked}>
                    {deployPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Rocket aria-hidden="true" />}
                    Deploy
                </Button>
            </div>

            {/* Live deploy view: shown only while a deployment is in flight. */}
            {truthDeployment?.id && ["pending", "running"].includes(truthDeployment.status) && (
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

            {showDeployError ? (
                <DeployFailedCard
                    app={app}
                    classification={truthErrorClassification}
                    rawError={truthErrorRaw}
                    liveRelease={liveRelease}
                    rollbackTarget={deployments.find((deployment) => canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked)) ?? null}
                    rollbackPending={rollbackPending}
                    deployPending={deployPending}
                    onViewLogs={onViewLogs}
                    onRollback={onRollback}
                    onRedeploy={onDeploy}
                    onApplyEnvFix={onApplyEnvFix}
                    quickFixPending={quickFixPending}
                />
            ) : null}

            <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                {historyItems.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Rocket className="size-5" aria-hidden="true" /></span>
                        <p className="font-semibold text-foreground">No deployments yet</p>
                        <p className="text-sm text-muted-foreground">Press Deploy to publish your app.</p>
                    </div>
                ) : (
                    <ul className="divide-y">
                        {visibleHistoryItems.map((item) => {
                            if (item.kind === "ci") {
                                const run = item.ciRun;
                                const failedCi = ciStatus(run) === "failed";
                                return (
                                    <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", failedCi ? "bg-danger-muted text-danger-text" : "bg-info-muted text-info-text")}>
                                            {failedCi ? <XCircle className="size-5" aria-hidden="true" /> : <Clock className="size-5" aria-hidden="true" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                                                {failedCi ? "Tests failed, deploy skipped" : "Waiting for tests"}
                                                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", failedCi ? "bg-danger-muted text-danger-text" : "bg-info-muted text-info-text")}>{ciRunBadgeText(run)}</span>
                                            </p>
                                            <p className="truncate text-sm text-muted-foreground">
                                                <span className="font-mono">{shortSha(run.commitSha)}</span> · {liveRelease ? "Your old version is still running." : ciRunFailureCopy(run)}
                                            </p>
                                        </div>
                                        <span className="w-20 text-right text-sm text-muted-foreground">{ciRunTime(run) ? formatRelativeTime(ciRunTime(run)!) : ""}</span>
                                        {run.runUrl ? (
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={run.runUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> GitHub run</a>
                                            </Button>
                                        ) : null}
                                    </li>
                                );
                            }

                            const deployment = item.deployment;
                            const canRollback = canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked);
                            const isCurrent = deployment.id === rollbackCurrentDeployment?.id && ["succeeded", "rolled_back"].includes(deployment.status);
                            const skipped = isLockBusyDeployment(deployment);
                            const queued = isServerQueuedDeployment(deployment);
                            const inFlight = ["pending", "running"].includes(deployment.status) && !queued;
                            const failed = ["failed", "aborted"].includes(deployment.status) && !skipped;
                            const duration = durationLabel(deployment);
                            return (
                                <li key={deployment.id} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
                                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", failed ? "bg-danger-muted text-danger-text" : inFlight ? "bg-info-muted text-info-text" : skipped || queued ? "bg-warning-muted text-warning-text" : "bg-success-muted text-success-text")}>
                                        {failed ? <XCircle className="size-5" aria-hidden="true" /> : inFlight ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : skipped ? <SkipForward className="size-5" aria-hidden="true" /> : queued ? <Clock className="size-5" aria-hidden="true" /> : <CheckCircle2 className="size-5" aria-hidden="true" />}
                                    </span>
                                    <button type="button" onClick={() => setDrawerId(deployment.id)} className="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open details for ${deployTitle(deployment)}`}>
                                        <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                                            <span className="truncate">{deployTitle(deployment)}</span>
                                            {isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span> : null}
                                            {failed ? <span className="rounded-full bg-danger-muted px-2 py-0.5 text-xs font-medium text-danger-text">Failed</span> : null}
                                            {skipped ? <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning-text">Skipped</span> : null}
                                            {queued ? <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning-text">Waiting for server</span> : null}
                                            {inFlight ? <span className="rounded-full bg-info-muted px-2 py-0.5 text-xs font-medium text-info-text">Building</span> : null}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 truncate text-sm text-muted-foreground">
                                            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />{app.branch ?? "main"}
                                            <span aria-hidden="true">·</span><span className="font-mono text-xs">{shortSha(deployment.sha)}</span>
                                            <span aria-hidden="true">·</span><span className="truncate">{deployActor(deployment)}</span>
                                        </span>
                                    </button>
                                    <span className="hidden w-20 text-sm text-muted-foreground md:block">{duration ?? "—"}</span>
                                    <span className="hidden w-20 text-sm text-muted-foreground md:block">{formatRelativeTime(deployment.startedAt)}</span>
                                    <span className="flex w-28 justify-end">
                                        {canRollback ? (
                                            <Button variant="outline" size="sm" disabled={rollbackPending} onClick={() => onRollback(deployment.sha)}><RotateCcw aria-hidden="true" /> Roll back</Button>
                                        ) : failed ? (
                                            <button type="button" onClick={() => setDrawerId(deployment.id)} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><FileText className="size-4" aria-hidden="true" /> View logs</button>
                                        ) : null}
                                    </span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${deployTitle(deployment)}`}><MoreHorizontal aria-hidden="true" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => setDrawerId(deployment.id)}><FileText aria-hidden="true" /> View details</DropdownMenuItem>
                                            <DropdownMenuItem disabled={deployPending || deleteLocked} onSelect={onDeploy}><RefreshCw aria-hidden="true" /> Redeploy</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {historyItems.length > INITIAL_DEPLOYMENT_COUNT && !showAllDeployments ? (
                    <div className="flex justify-center border-t py-3">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAllDeployments(true)}>
                            <ChevronDown aria-hidden="true" /> Load more ({historyItems.length - INITIAL_DEPLOYMENT_COUNT})
                        </Button>
                    </div>
                ) : null}
            </Card>

            <DeploymentCheckReportCard idPrefix={`deployment-check-report-${app.id}`} report={report} />

            <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                <button type="button" aria-expanded={modeOpen} onClick={() => setModeOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring">
                    <span>
                        <span className="block text-lg font-semibold text-foreground">Deploy mode</span>
                        <span className="block text-sm text-muted-foreground">How careful should Opslin be before going live?</span>
                    </span>
                    <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", modeOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {modeOpen ? (
                    <div className="space-y-6 border-t p-5">
                        <DeployModeSelector
                            idPrefix={`deploy-mode-${app.id}`}
                            appId={app.id}
                            branch={app.branch || "main"}
                            repoFullName={repoFullName}
                            currentMode={currentDeployMode}
                            hasSafeDeployGate={Boolean(activeDeployGate)}
                            gateId={activeDeployGate?.id}
                            currentTestRunner={activeDeployGate?.testRunner}
                            onSetupComplete={onSetupComplete}
                        />
                        {activeDeployGate ? (
                            <SafeDeploySetupWizard idPrefix={`safe-deploy-${app.id}`} app={app} gate={activeDeployGate} loading={deployGatesLoading} />
                        ) : null}
                    </div>
                ) : null}
            </Card>

            <DeploymentDrawer
                open={Boolean(drawerDeployment)}
                onOpenChange={(open) => !open && setDrawerId(null)}
                deployment={drawerDeployment}
                app={app}
                logs={drawerDeployment && drawerDeployment.id === rollbackCurrentDeployment?.id ? app.deployLogs : null}
                canRollback={drawerDeployment ? canRollbackDeployment(app, drawerDeployment, rollbackCurrentDeployment, deleteLocked) : false}
                previousTarget={deployments.find((deployment) => canRollbackDeployment(app, deployment, rollbackCurrentDeployment, deleteLocked)) ?? null}
                rollbackPending={rollbackPending}
                deployPending={deployPending}
                onRollback={(sha) => {
                    setDrawerId(null);
                    onRollback(sha);
                }}
                onRedeploy={() => {
                    setDrawerId(null);
                    onDeploy();
                }}
            />
        </section>
    );
}
