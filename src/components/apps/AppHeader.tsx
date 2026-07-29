"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Rocket, RotateCcw, StopCircle, Package, Server as ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LivePulse } from "@/components/patterns/live-pulse";
import type { App, Server } from "@/lib/api";
import { DeleteAppAction } from "./DeleteAppAction";
import { DeleteLifecycleNotice } from "./DeleteLifecycleNotice";
import { formatRelativeTime } from "@/lib/utils";

type AppHeaderProps = {
    app: App;
    server: Pick<Server, "name"> & { ip?: string | null; publicIp?: string | null; hostname?: string | null };
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

    // Resolve the live preview URL: prefer explicit prop, then preferredUrl, then primaryDomain
    const previewUrl = livePreviewUrl
        || app.preferredUrl
        || (app.primaryDomain ? `http://${app.primaryDomain}` : null)
        || (app.domain ? `http://${app.domain}` : null);

    // Domain shown in the header — prefer the primary domain over the full
    // preview URL so it reads as "myapp.example.com" not "http://myapp...".
    const headerDomain = app.primaryDomain || app.domain || null;

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
                            {app.status === "running" && (
                                <CheckCircle2 className="h-5 w-5 text-success-text flex-shrink-0" />
                            )}
                            <StatusBadge status={app.status} />
                        </div>
                        {headerDomain && (
                            <p className="text-sm text-foreground mt-1 flex items-center gap-1.5 min-w-0">
                                {app.status === "running" && <LivePulse />}
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
                    {/* Live Preview button */}
                    {previewUrl && app.status === "running" && (
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
        </div>
    );
}
