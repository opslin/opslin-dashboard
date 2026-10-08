"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Clock, Filter, Loader2, Rocket, Search, X } from "lucide-react";
import { toast } from "sonner";
import { RollbackConfirmDialog } from "@/components/apps/RollbackConfirmDialog";
import { deployActor, deployTitle, durationLabel, plainReason, progressPercent, progressPhase } from "@/components/apps/deploy-ui";
import { shortSha } from "@/components/apps/app-helpers";
import { DeploymentDrawer } from "@/components/deployments/drawer";
import { buildItems, computeStats, filterItems, isFailed, isRunning, latestFailure, statusLabel, type DeploymentItem, type StatusFilter } from "@/components/deployments/lib";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type AppWithServer, type DeploymentRecord } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 6;
const FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "running", label: "Running" },
    { id: "failed", label: "Failed" },
    { id: "succeeded", label: "Succeeded" },
];

function Skeleton({ className }: { className?: string }) {
    return <div className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} aria-hidden="true" />;
}

function LoadingState() {
    return (
        <div role="status" aria-label="Loading deployments" className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <Card key={i} className="gap-3 rounded-2xl p-5 shadow-xs"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-12" /><Skeleton className="h-3 w-32" /></Card>
                ))}
            </div>
            <Card className="gap-0 rounded-2xl p-5 shadow-xs">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 border-t py-4 first:border-t-0"><Skeleton className="size-8 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-72" /></div><Skeleton className="h-6 w-20 rounded-full" /></div>
                ))}
            </Card>
        </div>
    );
}

function StatusPill({ item }: { item: DeploymentItem }) {
    const status = statusLabel(item);
    const tone = {
        live: "bg-success-muted text-success-text",
        success: "bg-success-muted text-success-text",
        danger: "bg-danger-muted text-danger-text",
        info: "bg-info-muted text-info-text",
        neutral: "bg-secondary text-muted-foreground",
    }[status.tone];
    const dot = { live: "bg-success", success: "bg-success", danger: "bg-danger", info: "bg-info", neutral: "bg-muted-foreground" }[status.tone];
    return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone)}><span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />{status.label}</span>;
}

function StatusIcon({ item }: { item: DeploymentItem }) {
    const d = item.deployment;
    if (isRunning(d)) return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info-muted text-info-text"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /></span>;
    if (isFailed(d)) return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-muted text-danger-text"><X className="size-4" aria-hidden="true" /></span>;
    return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-muted text-success-text"><Check className="size-4" aria-hidden="true" /></span>;
}

function Row({ item, onDetails, onRollback }: { item: DeploymentItem; onDetails: (item: DeploymentItem) => void; onRollback: (item: DeploymentItem) => void }) {
    const { deployment, app } = item;
    const running = isRunning(deployment);
    const failed = isFailed(deployment);
    const percent = progressPercent(deployment);
    const phase = progressPhase(deployment);
    const duration = durationLabel(deployment);
    const target = item.live ? item.rollbackTo : deployment.status === "succeeded" ? deployment : null;
    const meta = [app.server.name, deployActor(deployment), running ? "in progress" : duration, formatRelativeTime(deployment.startedAt)].filter(Boolean);
    return (
        <li className="flex flex-wrap items-center gap-4 border-t py-4 first:border-t-0">
            <StatusIcon item={item} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/apps/${app.id}`} className="font-semibold text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">{app.name}</Link>
                    <code className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{shortSha(deployment.sha)}</code>
                    <span className="truncate text-sm text-foreground">{deployTitle(deployment)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p>
                {running ? (
                    <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${app.name} deploy progress`} aria-valuenow={percent ?? undefined}>
                        <div className={cn("h-full rounded-full bg-primary", percent === null && "w-1/3 animate-pulse motion-reduce:animate-none")} style={percent !== null ? { width: `${percent}%` } : undefined} />
                    </div>
                ) : null}
            </div>
            <div className="w-28"><StatusPill item={item} /></div>
            <div className="flex w-56 items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onDetails(item)} aria-label={`View details for ${app.name} ${shortSha(deployment.sha)}`}>View details</Button>
                {running ? (
                    <span className="w-16 whitespace-nowrap text-xs capitalize text-muted-foreground">{phase && /build/.test(phase) ? "Building" : phase || "Working"}</span>
                ) : failed ? (
                    <button type="button" onClick={() => onDetails(item)} className="w-16 whitespace-nowrap text-left text-xs font-semibold text-danger-text hover:underline focus-visible:ring-2 focus-visible:ring-ring">View logs</button>
                ) : target ? (
                    <button type="button" onClick={() => onRollback({ ...item, rollbackTo: target })} className="w-16 whitespace-nowrap text-left text-xs font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Roll back</button>
                ) : (
                    <span className="w-16" />
                )}
            </div>
        </li>
    );
}

export default function DeploymentsPage() {
    const queryClient = useQueryClient();
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [appId, setAppId] = useState("all");
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [details, setDetails] = useState<DeploymentItem | null>(null);
    const [rollback, setRollback] = useState<{ item: DeploymentItem; target: DeploymentRecord } | null>(null);
    const [bannerHidden, setBannerHidden] = useState(false);

    const appsQuery = useQuery({ queryKey: ["deployments", "apps"], queryFn: () => api.getAllApps() });
    const apps = useMemo<AppWithServer[]>(() => appsQuery.data ?? [], [appsQuery.data]);

    const deploymentsQuery = useQuery({
        queryKey: ["deployments", "all", apps.map((app) => app.id)],
        enabled: apps.length > 0,
        refetchInterval: 15_000,
        queryFn: async () => {
            const perApp = await Promise.all(
                apps.map(async (app) => {
                    try {
                        return { app, deployments: await api.getAppDeployments(app.id) };
                    } catch {
                        return { app, deployments: [] as DeploymentRecord[] };
                    }
                }),
            );
            return buildItems(perApp);
        },
    });
    const items = useMemo(() => deploymentsQuery.data ?? [], [deploymentsQuery.data]);
    const stats = useMemo(() => computeStats(items), [items]);
    const failure = useMemo(() => latestFailure(items), [items]);
    const filtered = useMemo(() => filterItems(items, { query, status, appId }), [items, query, status, appId]);
    const shown = filtered.slice(0, visible);
    const loading = appsQuery.isLoading || (apps.length > 0 && deploymentsQuery.isLoading);
    const filtering = query.trim() !== "" || status !== "all" || appId !== "all";

    const rollbackMutation = useMutation({
        mutationFn: ({ item, target }: { item: DeploymentItem; target: DeploymentRecord }) => api.rollbackApp(item.app.id, target.sha),
        onSuccess: () => {
            toast.success("Rolling back. Your app stays available.");
            setRollback(null);
            setDetails(null);
            void queryClient.invalidateQueries({ queryKey: ["deployments"] });
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not roll back"),
    });

    const retryMutation = useMutation({
        mutationFn: (item: DeploymentItem) => api.deployApp(item.app.server.id, item.app.id, {}),
        onSuccess: () => {
            toast.success("Deploying again");
            void queryClient.invalidateQueries({ queryKey: ["deployments"] });
        },
        onError: () => toast.error("Could not start the deploy. Open the app to see why."),
    });

    const startRollback = (item: DeploymentItem) => {
        const target = item.live ? item.rollbackTo : item.deployment;
        if (target) setRollback({ item, target });
    };

    const clearFilters = () => {
        setQuery("");
        setStatus("all");
        setAppId("all");
    };

    const failureReason = failure ? plainReason(failure.deployment.errorClassification, failure.deployment.healthLog) : null;
    const showFailureBanner = failure && !bannerHidden;

    return (
        <div className="dashboard-page">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace / Deployments</p>
                    <h1 className="mt-1 text-4xl font-bold tracking-tight text-foreground">Deployments</h1>
                    <p className="mt-1 text-muted-foreground">Everything that was released across your apps.</p>
                </div>
                <Button asChild size="lg"><Link href="/apps/new"><Rocket aria-hidden="true" />Deploy new</Link></Button>
            </div>

            {loading ? (
                <LoadingState />
            ) : apps.length === 0 || (!deploymentsQuery.isLoading && items.length === 0) ? (
                <div className="flex min-h-[45vh] items-center justify-center">
                    <div className="max-w-sm rounded-2xl border bg-card p-10 text-center shadow-xs">
                        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Rocket className="size-7" aria-hidden="true" /></span>
                        <h2 className="text-xl font-bold text-foreground">Nothing deployed yet</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">Deploy your first app and it will show up here.</p>
                        <Button asChild className="mt-5"><Link href="/apps/new"><Rocket aria-hidden="true" />Deploy your first app</Link></Button>
                    </div>
                </div>
            ) : (
                <>
                    {showFailureBanner ? (
                        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger-muted px-5 py-4 text-danger-text">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/70"><AlertTriangle className="size-5" aria-hidden="true" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold">{failure.app.name} failed to deploy {formatRelativeTime(failure.deployment.finishedAt ?? failure.deployment.startedAt)}</p>
                                <p className="text-sm">{failureReason?.description ?? "The latest build needs your attention."}</p>
                            </div>
                            <Button size="sm" variant="outline" className="bg-background text-foreground" onClick={() => setDetails(failure)}>View logs</Button>
                            <Button size="sm" variant="ghost" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(failure)}>{retryMutation.isPending ? "Starting" : "Try again"}</Button>
                            <button type="button" onClick={() => setBannerHidden(true)} aria-label="Dismiss" className="rounded p-1 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                        </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="gap-1 rounded-2xl p-5 shadow-xs">
                            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Running now</h2>{stats.runningCount > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-info-muted px-2 py-0.5 text-[11px] font-semibold text-info-text"><span className="size-1.5 rounded-full bg-info" aria-hidden="true" />In progress</span> : null}</div>
                            <p className="text-4xl font-bold tabular-nums text-foreground">{stats.runningCount}</p>
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{stats.running ? <><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /><b className="font-semibold text-foreground">{stats.running.app.name}</b> is deploying</> : "No active deployments"}</p>
                        </Card>
                        <Card className="gap-1 rounded-2xl p-5 shadow-xs">
                            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Failed this week</h2>{stats.failedThisWeek > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-muted px-2 py-0.5 text-[11px] font-semibold text-danger-text"><span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />Needs review</span> : null}</div>
                            <p className="text-4xl font-bold tabular-nums text-foreground">{stats.failedThisWeek}</p>
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="size-3.5" aria-hidden="true" />{stats.lastFailedAt ? `Last one ${formatRelativeTime(stats.lastFailedAt)}` : "Nothing failed. Nice."}</p>
                        </Card>
                        <Card className="gap-1 rounded-2xl p-5 shadow-xs">
                            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Success rate</h2><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last 7 days</span></div>
                            <p className="text-4xl font-bold tabular-nums text-foreground">{stats.successRate === null ? "—" : <>{stats.successRate}<span className="text-2xl">%</span></>}</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation"><div className="h-full rounded-full bg-success" style={{ width: `${stats.successRate ?? 0}%` }} /></div>
                            <p className="text-sm text-muted-foreground">{stats.finishedThisWeek} {stats.finishedThisWeek === 1 ? "deployment" : "deployments"} in the last 7 days</p>
                        </Card>
                    </div>

                    <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center justify-between px-6 pt-6">
                            <h2 className="text-xl font-bold text-foreground">Recent deployments</h2>
                            <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "deployment" : "deployments"} · {appId === "all" ? "All apps" : apps.find((app) => app.id === appId)?.name}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                            <div className="relative min-w-56 flex-1">
                                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search app or commit" aria-label="Search app or commit" className="h-10 pl-9" />
                            </div>
                            <div className="inline-flex rounded-lg border bg-muted/50 p-1" role="group" aria-label="Filter by status">
                                {FILTERS.map((filter) => (
                                    <button key={filter.id} type="button" aria-pressed={status === filter.id} onClick={() => setStatus(filter.id)} className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", status === filter.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{filter.label}</button>
                                ))}
                            </div>
                            <Select value={appId} onValueChange={setAppId}>
                                <SelectTrigger aria-label="App" className="h-10 w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All apps</SelectItem>
                                    {apps.map((app) => <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                                <span className="flex size-12 items-center justify-center rounded-full bg-success-muted text-success-text"><Check className="size-6" aria-hidden="true" /></span>
                                <h3 className="mt-2 text-lg font-bold text-foreground">{status === "failed" && !query && appId === "all" ? "No failed deployments this week. Nice." : "No deployments match"}</h3>
                                <p className="max-w-sm text-sm text-muted-foreground">{status === "failed" && !query && appId === "all" ? "Everything you deployed completed successfully." : "Try a different search or filter."}</p>
                                {filtering ? <Button variant="outline" onClick={clearFilters} className="mt-2"><Filter aria-hidden="true" />Clear filters</Button> : null}
                            </div>
                        ) : (
                            <ul className="px-6">
                                {shown.map((item) => (
                                    <Row key={item.deployment.id} item={item} onDetails={setDetails} onRollback={startRollback} />
                                ))}
                            </ul>
                        )}

                        {filtered.length > visible ? (
                            <div className="flex justify-center border-t py-4">
                                <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>Load more<ChevronDown aria-hidden="true" /></Button>
                            </div>
                        ) : null}
                        {filtered.length > 0 && filtered.length <= visible ? <div className="h-4" /> : null}
                    </Card>
                </>
            )}

            <DeploymentDrawer
                item={details}
                open={Boolean(details)}
                onOpenChange={(open) => !open && setDetails(null)}
                rollbackPending={rollbackMutation.isPending}
                onRollback={startRollback}
            />
            <RollbackConfirmDialog
                open={Boolean(rollback)}
                targetSha={rollback ? shortSha(rollback.target.sha) : null}
                detail={rollback ? { message: deployTitle(rollback.target), ago: formatRelativeTime(rollback.target.startedAt), status: "Succeeded" } : null}
                pending={rollbackMutation.isPending}
                onOpenChange={(open) => !open && setRollback(null)}
                onConfirm={() => rollback && rollbackMutation.mutate(rollback)}
            />
        </div>
    );
}

