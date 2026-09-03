"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, ExternalLink, Loader2, Rocket, RotateCcw, StopCircle, Package, Server as ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LivePulse } from "@/components/patterns/live-pulse";
import type { App, Server } from "@/lib/api";
import { DeleteAppAction } from "./DeleteAppAction";
import { DeleteLifecycleNotice } from "./DeleteLifecycleNotice";
import { PendingConfigDialog } from "./PendingConfigDialog";
import { DeployProgressDialog } from "./DeployProgressDialog";
import { formatRelativeTime } from "@/lib/utils";

type AppHeaderProps = {
    app: App;
    // `id` is needed by the pending-config dialog (Phase 23) to save env vars
    // and trigger the redeploy against the right server.
    server: Pick<Server, "id" | "name"> & { ip?: string | null; publicIp?: string | null; hostname?: string | null; status?: string; isLiveConnected?: boolean };
    livePreviewUrl?: string | null;
    deleteFailureReason?: string | null;
    deployPending: boolean;
    stopPending: boolean;
    deletePending: boolean;
    onDeploy: () => void;
    onStop: () => void;
    onDelete: () => void;
    onRetryDeleteCleanup: () => void;
};

export function AppHeader({
    app,
    server,
    livePreviewUrl,
    deleteFailureReason,
    deployPending,
    stopPending,
    deletePending,
    onDeploy,
    onStop,
    onDelete,
    onRetryDeleteCleanup,
}: AppHeaderProps) {
    const isDeleting = app.status === "deleting";
    const isDeleteFailed = app.status === "delete_failed";
    const isStopping = app.status === "stopping";
    const deleteLocked = isDeleting || isDeleteFailed;
    const deployedAgo = app.deployedAt ? formatRelativeTime(app.deployedAt) : null;
    // Display-only: what to actually show as "is this running right now" (badge, pulse, live
    // preview link). Distinct from `app.status` below, which still drives which action buttons
    // are valid to offer (Stop/Deploy/Delete) — those are backend lifecycle decisions, not
    // "is it currently reachable" ones, so they intentionally keep using the stored status.
    const isLive = server.isLiveConnected ?? server.status === "connected";
    const displayStatus = app.effectiveStatus ?? (app.status === "running" && !isLive ? "offline" : app.status);
    const isDisplayRunning = displayStatus === "running";

    // Resolve the live preview URL: prefer explicit prop, then preferredUrl, then primaryDomain
    const previewUrl = livePreviewUrl
        || app.preferredUrl
        || (app.primaryDomain ? `http://${app.primaryDomain}` : null)
        || (app.domain ? `http://${app.domain}` : null);

    // Domain shown in the header — prefer the primary domain over the full
    // preview URL so it reads as "myapp.example.com" not "http://myapp...".
    const headerDomain = app.primaryDomain || app.domain || null;

    // DIL Phase 22 — a background worker (no detected web framework) still
    // gets a real preview domain auto-provisioned like any other app, but
    // nothing serves HTTP there by design (healthCheckMode: "process", no
    // port ever checked) — clicking it 404s/502s. That looked exactly like
    // a silent deploy failure before role was labeled; now it reads as the
    // expected, correct state instead.
    const isBackgroundWorker = app.role === "worker";
    const pendingConfigKeyCount = app.pendingConfig?.keys?.length ?? 0;
    const [configOpen, setConfigOpen] = useState(false);
    // DIL Phase 25 — set only for an app created by an AI-assisted
    // auto-deploy; a normal wizard/CLI-created app has nothing to show here.
    const [progressOpen, setProgressOpen] = useState(false);

    return (
        <div className="border-b border-border bg-card">
            {/* Back link */}
            <div className="px-4 sm:px-6 lg:px-8 pt-4">
                <Link
                    href="/apps"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Apps
                </Link>
            </div>

            {/* Main header row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 sm:px-6 lg:px-8 py-5">
                {/* Left: App icon + name + status + domain + server */}
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-muted border border-border flex-shrink-0">
                        <Package size={36} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-bold text-foreground truncate">{app.name}</h1>
                            {isDisplayRunning && (
                                <CheckCircle2 className="h-5 w-5 text-success-text flex-shrink-0" />
                            )}
                            <StatusBadge status={displayStatus} />
                        </div>
                        {isBackgroundWorker ? (
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 min-w-0">
                                {isDisplayRunning && <LivePulse />}
                                <span>Background worker — no public URL</span>
                            </p>
                        ) : headerDomain && (
                            <p className="text-sm text-foreground mt-1 flex items-center gap-1.5 min-w-0">
                                {isDisplayRunning && <LivePulse />}
                                <a
                                    href={previewUrl || `http://${headerDomain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium truncate hover:text-brand transition-colors"
                                >
                                    {headerDomain}
                                </a>
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            {"Deployed on "}
                            <ServerIcon size={16} className="inline-block" />
                            <span className="font-medium text-foreground">{server.name}</span>
                            {deployedAgo ? <span>· {deployedAgo}</span> : null}
                        </p>
                    </div>
                </div>

                {/* Right: Action buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* DIL Phase 23 — this app deployed but is blocked on config
                        Opslin refused to guess. Deliberately first in the row and
                        in destructive styling: it's the only action that will
                        actually get the app running, so it must outrank Deploy. */}
                    {pendingConfigKeyCount > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfigOpen(true)}
                            className="h-9 px-4 text-sm"
                        >
                            <AlertTriangle className="h-4 w-4 mr-1.5" />
                            {pendingConfigKeyCount} value{pendingConfigKeyCount === 1 ? "" : "s"} needed
                        </Button>
                    )}

                    {/* DIL Phase 25 — reachable any time after an AI-assisted
                        deploy, not just while the wizard tab that started it
                        is still open. */}
                    {app.lastAutoDeployJobId && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setProgressOpen(true)}
                            className="h-9 px-4 text-sm"
                        >
                            <Eye className="h-4 w-4 mr-1.5" />
                            AI deploy progress
                        </Button>
                    )}

                    {/* Live Preview button */}
                    {previewUrl && isDisplayRunning && !isBackgroundWorker && (
                        <Button asChild variant="outline" size="sm" className="h-9 px-4 text-sm">
                            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-1.5" />
                                Live Preview
                            </a>
                        </Button>
                    )}

                    {/* Deploy button */}
                    {!deleteLocked && (
                        <Button
                            size="sm"
                            onClick={onDeploy}
                            disabled={deployPending}
                            className="h-9 px-4 text-sm"
                        >
                            {deployPending ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <Rocket className="h-4 w-4 mr-1.5" />
                            )}
                            {deployPending ? "Deploying..." : "Deploy"}
                        </Button>
                    )}

                    {/* Stop button */}
                    {isDeleting ? (
                        <Button variant="outline" size="sm" disabled className="h-9 px-4 text-sm">
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            Deleting...
                        </Button>
                    ) : isDeleteFailed ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRetryDeleteCleanup}
                            disabled={deletePending}
                            className="h-9 px-4 text-sm"
                        >
                            {deletePending ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <RotateCcw className="h-4 w-4 mr-1.5" />
                            )}
                            Retry Cleanup
                        </Button>
                    ) : app.status === "running" ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onStop}
                            disabled={stopPending || deleteLocked}
                            className="h-9 px-4 text-sm"
                        >
                            <StopCircle className="h-4 w-4 mr-1.5" />
                            {stopPending ? "Stopping..." : "Stop"}
                        </Button>
                    ) : isStopping ? (
                        <Button variant="outline" size="sm" disabled className="h-9 px-4 text-sm">
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            Stopping...
                        </Button>
                    ) : null}

                    {/* Delete App button */}
                    <DeleteAppAction
                        appName={app.name}
                        onConfirm={onDelete}
                        pending={deletePending}
                        disabled={deleteLocked}
                        size="sm"
                    />
                </div>
            </div>

            {/* DIL Phase 23 — the reason, spelled out inline. The button above
                is the action; this is what makes the situation understandable
                without opening anything. */}
            {pendingConfigKeyCount > 0 && (
                <div className="px-4 sm:px-6 lg:px-8 pb-4">
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <div className="min-w-0 text-sm">
                            <p className="font-medium text-foreground">
                                Waiting on {pendingConfigKeyCount} configuration value
                                {pendingConfigKeyCount === 1 ? "" : "s"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {app.pendingConfig?.reason
                                    || "This app needs values Opslin can't infer before it can start."}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                                {(app.pendingConfig?.keys ?? []).join(", ")}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete lifecycle notice */}
            {(isDeleting || isDeleteFailed) && (
                <div className="px-4 sm:px-6 lg:px-8 pb-4">
                    <DeleteLifecycleNotice
                        status={app.status}
                        errorReason={deleteFailureReason}
                        onRetry={isDeleteFailed ? onRetryDeleteCleanup : undefined}
                        retryPending={deletePending}
                    />
                </div>
            )}

            {/* Mounted only when there's actually something pending: the dialog
                pulls in react-query mutation machinery, and this header should
                not take on that context dependency for the overwhelmingly
                common case of an app with nothing blocked. */}
            {pendingConfigKeyCount > 0 && (
                <PendingConfigDialog
                    app={app}
                    serverId={server.id}
                    open={configOpen}
                    onOpenChange={setConfigOpen}
                />
            )}
            {app.lastAutoDeployJobId && (
                <DeployProgressDialog
                    serverId={server.id}
                    jobId={app.lastAutoDeployJobId}
                    appLabel={app.name}
                    open={progressOpen}
                    onOpenChange={setProgressOpen}
                />
            )}
        </div>
    );
}
