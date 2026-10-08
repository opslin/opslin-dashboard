"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BookOpen, Hourglass, Server as ServerIcon, WifiOff } from "lucide-react";
import { GuideSheet } from "@/components/monitoring/guide";
import {
    RANGES,
    aggregateCurrent,
    buildInsights,
    buildPoints,
    hasServerMetrics,
    healthScore,
    isServerLive,
    type HistoricalData,
    type Range,
    type ServerMetrics,
} from "@/components/monitoring/lib";
import { OverviewTab, type DeployMarker } from "@/components/monitoring/overview";
import { AppsTab, ServersTab, type ServerRow } from "@/components/monitoring/tabs";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AlertEventRecord, type AppOverviewMetric, type Server } from "@/lib/api";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const REFRESH_MS = 30_000;

async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Request failed: ${path}`);
    return res.json() as Promise<T>;
}

export default function MonitoringPage() {
    const [choice, setChoice] = useState("all");
    const [range, setRange] = useState<Range>("24h");
    const [guideOpen, setGuideOpen] = useState(false);

    const serversQuery = useQuery<Server[]>({ queryKey: ["servers"], queryFn: () => api.getServers(), refetchInterval: REFRESH_MS });
    const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
    const selectedId = choice !== "all" && servers.some((item) => item.id === choice) ? choice : "all";
    const targets = useMemo(() => (selectedId === "all" ? servers : servers.filter((item) => item.id === selectedId)), [servers, selectedId]);
    const liveTargets = useMemo(() => targets.filter(isServerLive), [targets]);

    const currentQueries = useQueries({
        queries: liveTargets.map((server) => ({
            queryKey: ["monitoring", "current", server.id],
            queryFn: async () => {
                const payload = await fetchJson<unknown>(`/metrics/${server.id}/current`);
                return hasServerMetrics(payload) ? payload : null;
            },
            refetchInterval: REFRESH_MS,
        })),
    });
    const historyQueries = useQueries({
        queries: liveTargets.map((server) => ({
            queryKey: ["monitoring", "history", server.id, range],
            queryFn: () => fetchJson<HistoricalData>(`/metrics/${server.id}/history?range=${range}`),
            refetchInterval: REFRESH_MS,
        })),
    });

    const appsQuery = useQuery<AppOverviewMetric[]>({ queryKey: ["metrics", "apps-overview"], queryFn: () => api.getAppsOverview(), refetchInterval: REFRESH_MS });
    const alertsQuery = useQuery<AlertEventRecord[]>({ queryKey: ["monitoring", "alerts", "firing"], queryFn: () => api.getAlertEvents("firing"), refetchInterval: REFRESH_MS, retry: false });

    const targetIds = useMemo(() => new Set(targets.map((item) => item.id)), [targets]);
    const apps = useMemo(() => (appsQuery.data ?? []).filter((app) => selectedId === "all" || targetIds.has(app.server.id)), [appsQuery.data, selectedId, targetIds]);

    const deployQueries = useQueries({
        queries: apps.slice(0, 8).map((app) => ({
            queryKey: ["monitoring", "deployments", app.id],
            queryFn: () => api.getAppDeployments(app.id),
            refetchInterval: 120_000,
            retry: false,
        })),
    });

    const currents = currentQueries.map((query) => query.data ?? null);
    const histories = historyQueries.map((query) => query.data ?? null);
    const currentKey = currents.map((item) => item?.timestamp ?? "").join("|");
    const historyKey = historyQueries.map((query) => query.dataUpdatedAt).join("|");
    const deployKey = deployQueries.map((query) => query.dataUpdatedAt).join("|");

    const rows: ServerRow[] = useMemo(
        () => targets.map((server) => ({ server, live: isServerLive(server), current: currents[liveTargets.findIndex((item) => item.id === server.id)] ?? null })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targets, liveTargets, currentKey],
    );
    const liveCurrents = useMemo(() => rows.flatMap((row) => (row.current ? [row.current] : [])), [rows]);
    const current: ServerMetrics | null = useMemo(() => aggregateCurrent(liveCurrents), [liveCurrents]);
    const points = useMemo(
        () => buildPoints(histories.flatMap((item) => (item ? [item] : []))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [historyKey],
    );
    const markers: DeployMarker[] = useMemo(() => {
        const list: DeployMarker[] = [];
        deployQueries.forEach((query, index) => {
            const app = apps[index];
            for (const deployment of query.data ?? []) {
                if (deployment.status !== "succeeded") continue;
                const t = new Date(deployment.startedAt).getTime();
                if (!Number.isNaN(t)) list.push({ t, label: `Deploy: ${app?.name ?? "app"}` });
            }
        });
        return list.sort((a, b) => a.t - b.t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deployKey, apps]);

    const insightRows = useMemo(
        () =>
            rows.map((row) => {
                const index = liveTargets.findIndex((item) => item.id === row.server.id);
                const history = index >= 0 ? histories[index] : null;
                const diskPoints = history ? history.series.timestamps.map((stamp, i) => ({ t: new Date(stamp).getTime(), value: history.series.diskPercent[i] ?? 0 })) : undefined;
                return { ...row, diskPoints };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, historyKey],
    );
    const insights = useMemo(() => buildInsights({ servers: insightRows, apps }), [insightRows, apps]);
    const alertsData = alertsQuery.data;
    const alerts = useMemo(() => (alertsQuery.isError ? null : (alertsData ?? [])), [alertsQuery.isError, alertsData]);
    const score = useMemo(() => healthScore({ servers: rows, apps, alerts: alerts ?? [] }), [rows, apps, alerts]);

    const online = rows.filter((row) => row.live).length;
    const updatedAt = Math.max(0, ...currentQueries.map((query) => query.dataUpdatedAt)) || null;
    const loading = serversQuery.isLoading || (liveTargets.length > 0 && currentQueries.some((query) => query.isLoading));
    const waiting = liveTargets.length > 0 && !loading && liveCurrents.length === 0;
    const allOffline = targets.length > 0 && liveTargets.length === 0;
    const serversLabel = selectedId === "all" ? (targets.length === 1 ? "1 server" : `Average of ${targets.length} servers`) : (targets[0]?.name ?? "");
    const selectedName = selectedId === "all" ? "All servers" : (targets[0]?.name || targets[0]?.hostname || "Server");

    if (!serversQuery.isLoading && servers.length === 0) {
        return (
            <div className="dashboard-page">
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-xs">
                        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><ServerIcon className="size-7" aria-hidden="true" /></span>
                        <h1 className="text-xl font-bold text-foreground">Connect a server to start monitoring</h1>
                        <p className="mt-2 text-sm text-muted-foreground">Opslin shows CPU, memory, disk and network as soon as your server connects.</p>
                        <Button asChild className="mt-5"><Link href="/servers/connect">Connect a server</Link></Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Monitoring</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Real-time health, performance and insights for your servers and apps.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={selectedId} onValueChange={setChoice}>
                        <SelectTrigger aria-label="Server" className="h-12 min-w-44 rounded-xl bg-card px-4">
                            <SelectValue>
                                <span className="text-left">
                                    <span className="block text-sm font-semibold leading-tight text-foreground">{selectedName}</span>
                                    <span className="block text-xs text-muted-foreground">{selectedId === "all" ? `${servers.length} ${servers.length === 1 ? "server" : "servers"}` : isServerLive(targets[0]) ? "Online" : "Offline"}</span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All servers</SelectItem>
                            {servers.map((server) => (
                                <SelectItem key={server.id} value={server.id}>{server.name || server.hostname || server.ip}{isServerLive(server) ? "" : " (offline)"}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="inline-flex rounded-xl border bg-card p-1" role="group" aria-label="Time range">
                        {RANGES.map((value) => (
                            <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={cn("rounded-lg px-3.5 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", range === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{value}</button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-1.5" role="status">
                        <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-success" /></span>
                        <span className="leading-tight"><span className="block text-sm font-semibold text-success-text">Live</span><span className="block text-xs text-muted-foreground">Auto-refresh 30s</span></span>
                    </div>
                    <Button variant="outline" className="h-12 rounded-xl px-4" onClick={() => setGuideOpen(true)}><BookOpen aria-hidden="true" />Guide</Button>
                </div>
            </div>

            <Tabs defaultValue="overview" className="gap-5">
                <TabsList variant="line" className="w-full justify-start border-b">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="servers">Servers</TabsTrigger>
                    <TabsTrigger value="apps">Apps</TabsTrigger>
                </TabsList>

                {allOffline ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger-muted px-5 py-4 text-sm text-danger-text">
                        <WifiOff className="size-5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold">{targets.length === 1 ? `${targets[0].name || "This server"} is offline` : "All servers are offline"}</p>
                            <p>Opslin can&apos;t reach {targets.length === 1 ? "it" : "them"}, so there are no live numbers.</p>
                        </div>
                        <Button asChild size="sm" variant="outline"><Link href={targets.length === 1 ? `/servers/${targets[0].id}` : "/servers"}>Show how to fix</Link></Button>
                    </div>
                ) : null}

                {loading ? (
                    <CardSkeleton count={4} />
                ) : waiting ? (
                    <div className="flex min-h-[40vh] items-center justify-center">
                        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-xs">
                            <Hourglass className="mx-auto mb-4 size-10 text-primary" aria-hidden="true" />
                            <h2 className="text-lg font-bold text-foreground">Your server is connected</h2>
                            <p className="mt-2 text-sm text-muted-foreground">The first numbers arrive within a minute. This page updates by itself.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <TabsContent value="overview">
                            <OverviewTab
                                range={range}
                                score={score}
                                serversTotal={rows.length}
                                serversOnline={online}
                                serversLabel={serversLabel}
                                isAll={selectedId === "all"}
                                apps={apps}
                                alerts={alerts}
                                insights={insights}
                                current={current}
                                points={points}
                                markers={markers}
                                updatedAt={updatedAt}
                            />
                        </TabsContent>
                        <TabsContent value="servers"><ServersTab rows={rows} /></TabsContent>
                        <TabsContent value="apps"><AppsTab apps={apps} /></TabsContent>
                    </>
                )}
            </Tabs>

            <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
        </div>
    );
}
