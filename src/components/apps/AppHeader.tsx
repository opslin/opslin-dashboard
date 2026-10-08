"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Eye, ExternalLink, GitBranch, Globe, Loader2, MoreHorizontal, Rocket, RotateCcw, ShieldCheck, StopCircle, Trash2, Server as ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { App, Server } from "@/lib/api";
import { DeleteAppConfirmDialog } from "./DeleteAppConfirmDialog";
import { DeleteLifecycleNotice } from "./DeleteLifecycleNotice";
import { PendingConfigDialog } from "./PendingConfigDialog";
import { DeployProgressDialog } from "./DeployProgressDialog";
import { formatRelativeTime } from "@/lib/utils";

const MENU_ITEM = "gap-3.5 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-foreground focus:bg-muted [&_svg]:size-[18px] [&_svg]:text-muted-foreground";

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
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    // DIL Phase 25 — set only for an app created by an AI-assisted
    // auto-deploy; a normal wizard/CLI-created app has nothing to show here.
    const [progressOpen, setProgressOpen] = useState(false);


    return (
        <div className="px-4 pt-5 sm:px-6 lg:px-8">
            {menuOpen ? <div className="pointer-events-none fixed inset-0 z-40 bg-slate-900/20" aria-hidden="true" /> : null}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/apps" className="hover:text-foreground">Apps</Link>
                <span aria-hidden="true">/</span>
                <span className="text-foreground">{app.name}</span>
            </nav>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Globe className="size-7" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">{app.name}</h1>
                            <StatusBadge status={displayStatus} label={displayStatus === "running" ? "Live" : displayStatus === "deploying" ? "Building" : undefined} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
                            {isBackgroundWorker ? (
                                <span>Background worker, no public URL</span>
                            ) : headerDomain ? (
                                <a href={previewUrl || `http://${headerDomain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium text-primary hover:underline">
                                    {headerDomain}
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                </a>
                            ) : (
                                <span>No link yet</span>
                            )}
                            <Link href={`/servers/${server.id}`} className="flex items-center gap-1.5 hover:text-foreground">
                                <ServerIcon className="size-4" aria-hidden="true" />
                                {server.name}
                            </Link>
                            {app.branch ? <span className="flex items-center gap-1.5"><GitBranch className="size-4" aria-hidden="true" />{app.branch}</span> : null}
                            {deployedAgo ? <span className="sr-only">Deployed {deployedAgo}</span> : null}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* DIL Phase 23: blocked on config Opslin refused to guess. First in the row so it outranks Deploy. */}
                    {pendingConfigKeyCount > 0 && (
                        <Button variant="destructive" size="lg" onClick={() => setConfigOpen(true)}>
                            <AlertTriangle aria-hidden="true" />
                            {pendingConfigKeyCount} value{pendingConfigKeyCount === 1 ? "" : "s"} needed
                        </Button>
                    )}

                    {/* DIL Phase 25: reachable any time after an AI-assisted deploy. */}
                    {app.lastAutoDeployJobId && (
                        <Button variant="outline" size="lg" onClick={() => setProgressOpen(true)}>
                            <Eye aria-hidden="true" />
                            AI deploy progress
                        </Button>
                    )}

                    {previewUrl && isDisplayRunning && !isBackgroundWorker && (
                        <Button asChild variant="outline" size="lg">
                            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink aria-hidden="true" />
                                Visit
                            </a>
                        </Button>
                    )}

                    {!deleteLocked && (
                        <Button size="lg" onClick={onDeploy} disabled={deployPending}>
                            {deployPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Rocket aria-hidden="true" />}
                            {deployPending ? "Deploying..." : "Deploy"}
                        </Button>
                    )}

                    {isDeleting ? (
                        <Button variant="outline" size="lg" disabled>
                            <Loader2 className="animate-spin" aria-hidden="true" />
                            Deleting...
                        </Button>
                    ) : isDeleteFailed ? (
                        <Button variant="outline" size="lg" onClick={onRetryDeleteCleanup} disabled={deletePending}>
                            {deletePending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                            Retry Cleanup
                        </Button>
                    ) : isStopping ? (
                        <Button variant="outline" size="lg" disabled>
                            <Loader2 className="animate-spin" aria-hidden="true" />
                            Stopping...
                        </Button>
                    ) : null}

                    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-lg" aria-label="More app actions" className="relative z-50">
                                <MoreHorizontal aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={12} className="w-60 rounded-2xl border-border/70 bg-card p-2 shadow-xl outline-none focus-visible:ring-0">
                            <DropdownMenuLabel className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">App actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild className={MENU_ITEM}>
                                <Link href={`/apps/${app.id}?section=security`}><ShieldCheck aria-hidden="true" /> Security</Link>
                            </DropdownMenuItem>
                            {app.status === "running" && !deleteLocked ? (
                                <DropdownMenuItem className={MENU_ITEM} disabled={stopPending} onSelect={onStop}>
                                    <StopCircle aria-hidden="true" /> {stopPending ? "Stopping..." : "Stop app"}
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator className="mx-1 my-2" />
                            <DropdownMenuItem
                                className={`${MENU_ITEM} text-danger-text focus:bg-danger-muted focus:text-danger-text [&_svg]:!text-danger-text`}
                                disabled={deleteLocked || deletePending}
                                onSelect={() => setDeleteOpen(true)}
                            >
                                <Trash2 aria-hidden="true" /> Delete app
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DeleteAppConfirmDialog
                        appName={app.name}
                        open={deleteOpen}
                        pending={deletePending}
                        onOpenChange={setDeleteOpen}
                        onConfirm={() => {
                            onDelete();
                            setDeleteOpen(false);
                        }}
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
