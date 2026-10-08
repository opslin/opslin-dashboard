"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Check, ChevronRight, Clock, Copy, Cpu, ExternalLink, Folder, GitBranch, Globe, MemoryStick, MoreHorizontal, Package, Pencil, RotateCcw, Server as ServerIcon, Timer } from "lucide-react";
import { toast } from "sonner";
import { DeleteLifecycleNotice } from "@/components/apps/DeleteLifecycleNotice";
import { ErrorCard } from "@/components/apps/error-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, ApiRequestError, type App, type AppDomainsResponse, type DeployErrorClassification, type DeploymentRecord, type Server as OpslinServer } from "@/lib/api";
import { appDomainUrl, resolveVisibleDomain, shortSha } from "../app-helpers";
import { cn, formatRelativeTime } from "@/lib/utils";

type OverviewSectionProps = {
    app: App;
    server: OpslinServer;
    domainData?: AppDomainsResponse;
    domainsLoading: boolean;
    latestDeployment?: DeploymentRecord | null;
    rollbackTarget?: DeploymentRecord | null;
    deployErrorClassification?: DeployErrorClassification | null;
    deployErrorRaw?: string | null;
    deleteFailureReason?: string | null;
    deployPending: boolean;
    rollbackPending: boolean;
    deletePending: boolean;
    deleteLocked: boolean;
    onDeploy: () => void;
    onViewLogs: () => void;
    onRollback: (sha: string) => void;
    onRetryDeleteCleanup: () => void;
    onApplyEnvFix?: (envPatch: Record<string, string | null>) => void;
    quickFixPending?: boolean;
};

const RANGES = [
    { id: "1h" as const, label: "1h" },
    { id: "24h" as const, label: "24h" },
    { id: "7d" as const, label: "7d" },
    { id: "30d" as const, label: "30d" },
];

const DEPLOY_STATUS: Record<string, { label: string; tone: "success" | "danger" | "info" | "neutral" }> = {
    succeeded: { label: "Success", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
    running: { label: "Deploying", tone: "info" },
    pending: { label: "Queued", tone: "info" },
    rolled_back: { label: "Rolled back", tone: "neutral" },
    aborted: { label: "Stopped", tone: "neutral" },
};

const TONE_TEXT = { success: "text-success-text", danger: "text-danger-text", info: "text-info-text", neutral: "text-muted-foreground" } as const;
const TONE_DOT = { success: "bg-success", danger: "bg-danger", info: "bg-info", neutral: "bg-muted-foreground" } as const;

/** What the big card says, by the app's real current state. */
function stateCopy(status: string, name: string) {
    switch (status) {
        case "running":
            return { title: `${name} is live`, text: "Your app is running and reachable.", tone: "success" as const };
        case "deploying":
        case "pending":
            return { title: `${name} is deploying`, text: "A new version is being built. This usually takes a minute or two.", tone: "info" as const };
        case "offline":
            return { title: `${name} is offline`, text: "The server it runs on is not connected right now.", tone: "danger" as const };
        case "unhealthy":
        case "error":
            return { title: `${name} needs attention`, text: "The app is running but not answering its health check.", tone: "danger" as const };
        case "stopped":
        case "stopping":
            return { title: `${name} is stopped`, text: "Deploy it again to bring it back online.", tone: "neutral" as const };
        default:
            return { title: name, text: "Waiting for the latest status.", tone: "neutral" as const };
    }
}

function Spark({ values, color = "var(--chart-1)" }: { values: number[]; color?: string }) {
    if (values.length < 2) return null;
    const w = 240;
    const h = 44;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)] as const);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={color} fillOpacity="0.12" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function Fact({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card/80 text-muted-foreground ring-1 ring-border">
                <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-[15px] font-semibold text-foreground">{value}</p>
                {sub ? <p className="truncate font-mono text-xs text-muted-foreground">{sub}</p> : null}
            </div>
        </div>
    );
}

function DetailRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-3 px-5 py-3 text-sm">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
            <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate font-medium text-foreground">{children}</span>
        </li>
    );
}

function repoLabel(gitUrl?: string) {
    if (!gitUrl) return null;
    return gitUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "");
}

export function OverviewSection({
    app,
    server,
    domainData,
    latestDeployment,
    deployErrorClassification,
    deployErrorRaw,
    deleteFailureReason,
    deployPending,
    rollbackPending,
    deletePending,
    deleteLocked,
    onDeploy,
    onRollback,
    onRetryDeleteCleanup,
    onApplyEnvFix,
    quickFixPending,
}: OverviewSectionProps) {
    const [range, setRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");

    const domains = domainData?.domains ?? [];
    const visibleDomain = resolveVisibleDomain(domainData);
    const primaryHost = visibleDomain?.domain.domain ?? app.primaryDomain ?? app.domain ?? null;
    const primaryUrl = (visibleDomain ? appDomainUrl(visibleDomain.domain) : null) ?? app.preferredUrl ?? (primaryHost ? `http://${primaryHost}` : null);
    const serverLive = server.isLiveConnected ?? server.status === "connected";
    const displayStatus = app.effectiveStatus ?? (app.status === "running" && !serverLive ? "offline" : app.status);
    const copy = stateCopy(displayStatus, app.name);
    const showDeployError = Boolean(deployErrorClassification || deployErrorRaw);

    const requestWindow = range === "30d" ? "7d" : range;
    const { data: summary, error: summaryError } = useQuery({
        queryKey: ["app-request-summary", app.id, requestWindow],
        queryFn: () => api.getRequestSummary(app.id, requestWindow),
        refetchInterval: 30_000,
        retry: (count, error) => !(error instanceof ApiRequestError && error.status === 403) && count < 2,
    });
    const locked = summaryError instanceof ApiRequestError && summaryError.status === 403;
    const { data: latency } = useQuery({
        queryKey: ["app-request-latency", app.id, requestWindow],
        queryFn: () => api.getRequestLatency(app.id, requestWindow),
        refetchInterval: 30_000,
        enabled: !locked,
        retry: false,
    });
    const { data: current } = useQuery({
        queryKey: ["app-metrics-current", app.id],
        queryFn: () => api.getAppMetricsCurrent(app.id),
        enabled: app.status === "running",
        refetchInterval: 30_000,
        retry: false,
    });
    const { data: deploymentList } = useQuery({
        queryKey: ["app-deployments", app.id],
        queryFn: () => api.getAppDeployments(app.id),
        refetchInterval: 15_000,
    });

    const deployments = (deploymentList ?? []).slice(0, 5);
    const currentSha = deployments.find((d) => d.status === "succeeded")?.sha;
    const failedStyle = copy.tone === "danger";
    const statusCardClass =
        copy.tone === "success" ? "border-success/25 bg-success-muted/50"
        : copy.tone === "danger" ? "border-danger/25 bg-danger-muted/50"
        : copy.tone === "info" ? "border-info/25 bg-info-muted/50"
        : "border-border bg-muted/30";
    const badgeClass =
        copy.tone === "success" ? "bg-success text-success-foreground"
        : copy.tone === "danger" ? "bg-danger text-danger-foreground"
        : copy.tone === "info" ? "bg-info text-info-foreground"
        : "bg-muted-foreground/70 text-background";

    const copyUrl = async () => {
        if (!primaryUrl) return;
        try {
            await navigator.clipboard.writeText(primaryUrl);
            toast.success("Link copied");
        } catch {
            toast.error("Couldn't copy the link");
        }
    };

    const deployed = latestDeployment?.finishedAt ?? latestDeployment?.startedAt ?? app.deployedAt;
    const latencyValues = (latency?.series ?? []).map((p) => Math.round(p.p50));

    return (
        <section className="space-y-5">
            {app.status === "deleting" || app.status === "delete_failed" ? (
                <DeleteLifecycleNotice status={app.status} errorReason={deleteFailureReason} onRetry={app.status === "delete_failed" ? onRetryDeleteCleanup : undefined} retryPending={deletePending} />
            ) : null}
            {showDeployError ? (
                <ErrorCard classification={deployErrorClassification} rawError={deployErrorRaw} onRetry={onDeploy} retryDisabled={deployPending || deleteLocked} onApplyEnvFix={onApplyEnvFix} quickFixPending={quickFixPending} />
            ) : null}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="min-w-0 space-y-5">
                    <div className={cn("rounded-2xl border p-5", statusCardClass)}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", badgeClass)}>
                                    {failedStyle ? <AlertTriangle className="size-6" aria-hidden="true" /> : <Check className="size-6" strokeWidth={3} aria-hidden="true" />}
                                </span>
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h2>
                                    <p className="text-[15px] text-muted-foreground">{copy.text}</p>
                                </div>
                            </div>
                            {primaryUrl ? (
                                <div className="flex items-center gap-1 rounded-xl border bg-card/80 py-1 pl-3 pr-1 text-sm">
                                    <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium text-primary hover:underline">
                                        {primaryUrl}
                                        <ExternalLink className="size-3.5" aria-hidden="true" />
                                    </a>
                                    <button type="button" aria-label="Copy link" onClick={() => void copyUrl()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                        <Copy className="size-4" aria-hidden="true" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        <div className="mt-5 grid gap-4 border-t border-border/60 pt-5 sm:grid-cols-3">
                            <Fact icon={GitBranch} label="Latest deployment" value={deployed ? formatRelativeTime(deployed) : "Not deployed yet"} sub={latestDeployment ? `${shortSha(latestDeployment.sha)} · ${app.branch ?? "main"}` : undefined} />
                            <Fact icon={ServerIcon} label="Server" value={server.name} sub={server.publicIp || server.ip || undefined} />
                            <Fact icon={Package} label="Runtime" value={latestDeployment?.buildpackName || "Auto-detected"} sub={latestDeployment?.buildpackVersion || undefined} />
                        </div>
                    </div>

                    <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-5 pt-4">
                            <h2 className="text-lg font-semibold text-foreground">Performance <span className="text-sm font-normal text-muted-foreground">(last {range === "1h" ? "hour" : range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"})</span></h2>
                            <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Time range">
                                {RANGES.map((r) => (
                                    <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)} className={cn("rounded-md px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring", range === r.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {locked ? (
                            <p className="px-5 py-8 text-sm text-muted-foreground">
                                Traffic numbers are part of a paid plan. <Link href="/pricing" className="font-medium text-primary hover:underline">See plans</Link>
                            </p>
                        ) : (
                            <div className="grid divide-y px-2 pb-4 pt-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                                <div className="px-3 py-3">
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="size-4" aria-hidden="true" />Requests</p>
                                    <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{summary ? summary.totalRequests.toLocaleString() : "—"}</p>
                                    <p className="text-xs text-muted-foreground">{summary ? "Total in this period" : "No traffic recorded yet"}</p>
                                </div>
                                <div className="px-3 py-3">
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><Timer className="size-4" aria-hidden="true" />Response time</p>
                                    <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{summary && summary.totalRequests > 0 ? `${Math.round(summary.avgResponseMs)} ms` : "—"}</p>
                                    <Spark values={latencyValues} color="var(--chart-2)" />
                                </div>
                                <div className="px-3 py-3">
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="size-4" aria-hidden="true" />Error rate</p>
                                    <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{summary && summary.totalRequests > 0 ? `${summary.errorRate.toFixed(1)}%` : "—"}</p>
                                    <p className="text-xs text-muted-foreground">{summary ? `${summary.errorRequests.toLocaleString()} failed requests` : "No traffic recorded yet"}</p>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-5 py-4">
                            <h2 className="text-lg font-semibold text-foreground">Recent deployments</h2>
                            <Link href={`/apps/${app.id}?section=deployments`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                                View all <ChevronRight className="size-4" aria-hidden="true" />
                            </Link>
                        </div>
                        {deployments.length === 0 ? (
                            <p className="border-t px-5 py-8 text-sm text-muted-foreground">No deployments yet. Press Deploy to publish your app.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[640px] border-collapse text-sm">
                                    <thead>
                                        <tr className="border-y bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                                            <th className="px-5 py-2.5">Status</th>
                                            <th className="px-3 py-2.5">Branch</th>
                                            <th className="px-3 py-2.5">Commit</th>
                                            <th className="px-3 py-2.5">Deployed by</th>
                                            <th className="px-3 py-2.5">Time</th>
                                            <th className="px-5 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deployments.map((d) => {
                                            const s = DEPLOY_STATUS[d.status] ?? { label: d.status, tone: "neutral" as const };
                                            const canRollback = d.status === "succeeded" && d.sha !== currentSha;
                                            return (
                                                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                                                    <td className="px-5 py-3.5">
                                                        <span className={cn("flex items-center gap-2 font-medium", TONE_TEXT[s.tone])}>
                                                            <span className={cn("size-2 rounded-full", TONE_DOT[s.tone])} aria-hidden="true" />
                                                            {s.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3.5"><span className="flex items-center gap-1.5 text-foreground"><GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />{app.branch ?? "main"}</span></td>
                                                    <td className="px-3 py-3.5 font-mono text-xs text-muted-foreground">{shortSha(d.sha)}</td>
                                                    <td className="max-w-[180px] truncate px-3 py-3.5 text-foreground">{d.triggeredBy}</td>
                                                    <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{formatRelativeTime(d.startedAt)}</td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon-sm" aria-label={`Options for deployment ${shortSha(d.sha)}`}><MoreHorizontal aria-hidden="true" /></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem asChild><Link href={`/apps/${app.id}?section=deployments`}>View details</Link></DropdownMenuItem>
                                                                {canRollback ? (
                                                                    <DropdownMenuItem disabled={rollbackPending} onSelect={() => onRollback(d.sha)}><RotateCcw aria-hidden="true" /> Roll back to this</DropdownMenuItem>
                                                                ) : null}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="min-w-0 space-y-5">
                    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-5 py-4">
                            <h2 className="text-lg font-semibold text-foreground">Application details</h2>
                            <Link href={`/apps/${app.id}?section=settings`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"><Pencil className="size-3.5" aria-hidden="true" />Edit</Link>
                        </div>
                        <ul className="divide-y border-t">
                            <DetailRow icon={Package} label="Name">{app.name}</DetailRow>
                            {app.gitUrl ? (
                                <DetailRow icon={Folder} label="Repository">
                                    <a href={app.gitUrl.replace(/\.git$/, "")} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">{repoLabel(app.gitUrl)}</a>
                                </DetailRow>
                            ) : null}
                            {app.branch ? <DetailRow icon={GitBranch} label="Branch">{app.branch}</DetailRow> : null}
                            <DetailRow icon={ServerIcon} label="Server"><Link href={`/servers/${server.id}`} className="text-primary hover:underline">{server.name}</Link></DetailRow>
                            {primaryUrl ? <DetailRow icon={Globe} label="Primary URL"><a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">{primaryUrl}</a></DetailRow> : null}
                            <DetailRow icon={Clock} label="Created">{new Date(app.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</DetailRow>
                            {app.deployedAt ? <DetailRow icon={Clock} label="Updated">{new Date(app.deployedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</DetailRow> : null}
                        </ul>
                    </Card>

                    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-5 py-4">
                            <h2 className="text-lg font-semibold text-foreground">Current resources</h2>
                            <Link href={`/servers/${server.id}`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">View on server <ExternalLink className="size-3.5" aria-hidden="true" /></Link>
                        </div>
                        <ul className="space-y-3 border-t px-5 py-4 text-sm">
                            {[
                                { icon: Cpu, label: "CPU", pct: current?.cpuPercent, text: current?.cpuPercent != null ? `${Math.round(current.cpuPercent)}%` : "—" },
                                { icon: MemoryStick, label: "Memory", pct: current?.memoryPercent, text: current?.memoryUsed != null && current?.memoryLimit ? `${(current.memoryUsed / 1024 ** 3).toFixed(1)} GB / ${(current.memoryLimit / 1024 ** 3).toFixed(1)} GB` : "—" },
                            ].map((row) => (
                                <li key={row.label} className="flex items-center gap-3">
                                    <row.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                                    <span className="w-16 text-muted-foreground">{row.label}</span>
                                    <span className="w-28 shrink-0 font-medium text-foreground">{row.text}</span>
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
                                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(row.pct != null ? 3 : 0, row.pct ?? 0))}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-5 py-4">
                            <h2 className="text-lg font-semibold text-foreground">Domains</h2>
                            <Link href={`/apps/${app.id}?section=domains`} className="text-sm font-medium text-primary hover:underline">Manage</Link>
                        </div>
                        <ul className="divide-y border-t">
                            {domains.length === 0 && !primaryHost ? <li className="px-5 py-5 text-sm text-muted-foreground">No domains yet.</li> : null}
                            {domains.length === 0 && primaryHost ? (
                                <li className="flex items-center gap-3 px-5 py-3 text-sm">
                                    <Globe className="size-4 shrink-0 text-primary" aria-hidden="true" />
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{primaryHost}</span>
                                    <span className="rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-medium text-success-text">Primary</span>
                                </li>
                            ) : null}
                            {domains.slice(0, 4).map((d) => {
                                const active = d.status === "active" || d.connectedAt;
                                return (
                                    <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                                        <Globe className="size-4 shrink-0 text-primary" aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{d.domain}</span>
                                        {d.primary ? (
                                            <span className="rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-medium text-success-text">Primary</span>
                                        ) : !active ? (
                                            <span className="rounded-full bg-warning-muted px-2.5 py-0.5 text-xs font-medium text-warning-text">Pending</span>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </Card>
                </div>
            </div>
        </section>
    );
}
