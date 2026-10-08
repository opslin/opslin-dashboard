"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleHelp, Server as ServerIcon } from "lucide-react";
import { toast } from "sonner";
import { CreateAlertDialog } from "@/components/monitoring/create-alert";
import { GuideSheet } from "@/components/monitoring/guide";
import {
    RANGES,
    RANGE_LABEL,
    aggregateCurrent,
    buildInsights,
    buildPoints,
    daysUntilFull,
    hasServerMetrics,
    healthScore,
    isServerLive,
    type HistoricalData,
    type Range,
    type ServerMetrics,
} from "@/components/monitoring/lib";
import { OverviewTab, type DeployMarker } from "@/components/monitoring/overview";
import { NoServersState, OfflineState, StaleBanner, WaitingState, type LastKnown } from "@/components/monitoring/states";
import { AppsTab, ServersTab, type ServerRow } from "@/components/monitoring/tabs";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AlertEventRecord, type AppOverviewMetric, type Server } from "@/lib/api";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const REFRESH_MS = 30_000;
const TOUR_KEY = "opslin-monitoring-tour";
const STALE_AFTER_MINUTES = 3;

const TOUR = [
    { title: "Health summary", body: "Your answer in one sentence." },
    { title: "What we noticed", body: "Findings with a clear next step." },
    { title: "Chart markers", body: "See when deploys changed things." },
];

async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Request failed: ${path}`);
    return res.json() as Promise<T>;
}

function readTourDone() {
    try {
        return window.localStorage.getItem(TOUR_KEY) === "done";
    } catch {
        return true;
    }
}

export default function MonitoringPage() {
    const queryClient = useQueryClient();
    const [choice, setChoice] = useState("all");
    const [range, setRange] = useState<Range>("24h");
    const [tab, setTab] = useState("overview");
    const [guideOpen, setGuideOpen] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [tourStep, setTourStep] = useState(() => (typeof window === "undefined" || readTourDone() ? -1 : 0));

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
    // History is fetched for offline servers too, so we can show their last known numbers.
    const historyQueries = useQueries({
        queries: targets.map((server) => ({
            queryKey: ["monitoring", "history", server.id, range],
            queryFn: () => fetchJson<HistoricalData>(`/metrics/${server.id}/history?range=${range}`),
            refetchInterval: REFRESH_MS,
            retry: false,
        })),
    });

    const appsQuery = useQuery<AppOverviewMetric[]>({ queryKey: ["metrics", "apps-overview"], queryFn: () => api.getAppsOverview(), refetchInterval: REFRESH_MS });
    const alertsQuery = useQuery<AlertEventRecord[]>({ queryKey: ["monitoring", "alerts", "firing"], queryFn: () => api.getAlertEvents("firing"), refetchInterval: REFRESH_MS, retry: false });

    const silence = useMutation({
        mutationFn: (ruleId: string) => api.silenceAlertRule(ruleId, "1h"),
        onSuccess: () => {
            toast.success("Alert silenced for 1 hour");
            void queryClient.invalidateQueries({ queryKey: ["monitoring", "alerts"] });
        },
        onError: () => toast.error("Could not silence the alert"),
    });

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

    const currentKey = currentQueries.map((query) => query.dataUpdatedAt).join("|");
    const historyKey = historyQueries.map((query) => query.dataUpdatedAt).join("|");
    const deployKey = deployQueries.map((query) => query.dataUpdatedAt).join("|");

    const rows: ServerRow[] = useMemo(
        () =>
            targets.map((server) => {
                const index = liveTargets.findIndex((item) => item.id === server.id);
                return { server, live: index >= 0, current: index >= 0 ? (currentQueries[index]?.data ?? null) : null };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targets, liveTargets, currentKey],
    );
    const liveCurrents = useMemo(() => rows.flatMap((row) => (row.current ? [row.current] : [])), [rows]);
    const current: ServerMetrics | null = useMemo(() => aggregateCurrent(liveCurrents), [liveCurrents]);

    const histories = useMemo(
        () => targets.map((server, index) => ({ server, live: isServerLive(server), data: historyQueries[index]?.data ?? null })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targets, historyKey],
    );
    const points = useMemo(() => buildPoints(histories.flatMap((item) => (item.live && item.data ? [item.data] : []))), [histories]);
    const lastKnown: LastKnown = useMemo(() => {
        const last = histories.flatMap((item) => {
            const s = item.data?.series;
            if (!s || s.cpu.length === 0) return [];
            const i = s.cpu.length - 1;
            return [{ cpu: s.cpu[i], memory: s.memoryPercent[i], disk: s.diskPercent[i] }];
        });
        if (last.length === 0) return null;
        const avg = (pick: (item: (typeof last)[number]) => number) => last.reduce((sum, item) => sum + pick(item), 0) / last.length;
        return { cpu: avg((x) => x.cpu), memory: avg((x) => x.memory), disk: avg((x) => x.disk) };
    }, [histories]);

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
                const history = histories.find((item) => item.server.id === row.server.id)?.data;
                const diskPoints = history ? history.series.timestamps.map((stamp, i) => ({ t: new Date(stamp).getTime(), value: history.series.diskPercent[i] ?? 0 })) : undefined;
                return { ...row, diskPoints };
            }),
        [rows, histories],
    );
    const insights = useMemo(() => buildInsights({ servers: insightRows, apps }), [insightRows, apps]);
    const diskDays = useMemo(() => {
        const days = insightRows.flatMap((row) => (row.current && row.current.disk.percent >= 70 && row.diskPoints ? [daysUntilFull(row.diskPoints)] : [])).filter((d): d is number => d !== null);
        return days.length ? Math.min(...days) : null;
    }, [insightRows]);

    const alertsData = alertsQuery.data;
    const alerts = useMemo(() => (alertsQuery.isError ? null : (alertsData ?? [])), [alertsQuery.isError, alertsData]);
    const score = useMemo(() => healthScore({ servers: rows, apps, alerts: alerts ?? [] }), [rows, apps, alerts]);

    const online = rows.filter((row) => row.live).length;
    const newest = liveCurrents.reduce((max, item) => Math.max(max, new Date(item.timestamp).getTime()), 0);
    const staleMinutes = newest ? Math.floor((Date.now() - newest) / 60_000) : 0;
    const stale = staleMinutes >= STALE_AFTER_MINUTES;
    const loading = serversQuery.isLoading || (liveTargets.length > 0 && currentQueries.some((query) => query.isLoading));
    const waiting = liveTargets.length > 0 && !loading && liveCurrents.length === 0;
    const allOffline = targets.length > 0 && liveTargets.length === 0;
    const serversLabel = selectedId === "all" ? (targets.length === 1 ? "1 server" : `Highest across ${targets.length} servers`) : (targets[0]?.name ?? "");
    const selectedName = selectedId === "all" ? "All servers" : targets[0]?.name || targets[0]?.hostname || "Server";
    const offlineTarget = targets.length === 1 ? targets[0] : null;
    const offlineSince = offlineTarget?.lastSeenAt ? new Date(offlineTarget.lastSeenAt) : null;
    const defaultAlertServer = selectedId !== "all" ? selectedId : liveTargets[0]?.id ?? "";

    const finishTour = () => {
        setTourStep(-1);
        try {
            window.localStorage.setItem(TOUR_KEY, "done");
        } catch {
            // Storage can be blocked; the tour just shows again next time.
        }
    };
    const showTour = tourStep >= 0 && tab === "overview" && !loading && !waiting && !allOffline;
    const retry = () => {
        void queryClient.invalidateQueries({ queryKey: ["monitoring"] });
        void serversQuery.refetch();
    };

    if (!serversQuery.isLoading && servers.length === 0) {
        return (
            <div className="dashboard-page">
                <NoServersState onHelp={() => setGuideOpen(true)} />
                <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Monitoring</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Health and performance, without the guesswork.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={selectedId} onValueChange={setChoice}>
                        <SelectTrigger aria-label="Server" className="h-10 min-w-40 gap-2 rounded-lg bg-card px-3.5 text-sm font-semibold">
                            <ServerIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                            <SelectValue>{selectedName}</SelectValue>
                            <ChevronDown className="sr-only" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All servers</SelectItem>
                            {servers.map((server) => (
                                <SelectItem key={server.id} value={server.id}>{server.name || server.hostname || server.ip}{isServerLive(server) ? "" : " (offline)"}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="inline-flex rounded-lg border bg-muted/50 p-1" role="group" aria-label="Time range">
                        {RANGES.map((value) => (
                            <button key={value} type="button" aria-pressed={range === value} title={RANGE_LABEL[value]} onClick={() => setRange(value)} className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", range === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{value}</button>
                        ))}
                    </div>
                    <p className="flex items-center gap-2 text-sm" role="status">
                        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>
                        <span className="font-semibold text-success-text">Live</span>
                        <span className="text-muted-foreground">· 30s refresh</span>
                    </p>
                    <Button variant="outline" className="h-10" onClick={() => setGuideOpen(true)}><CircleHelp aria-hidden="true" />Guide</Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="gap-5">
                <TabsList variant="line" className="w-full justify-start border-b">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="servers">Servers</TabsTrigger>
                    <TabsTrigger value="apps">Apps</TabsTrigger>
                </TabsList>

                {stale && !allOffline ? <StaleBanner minutes={staleMinutes} onRetry={retry} /> : null}

                {loading ? (
                    <CardSkeleton count={4} />
                ) : waiting ? (
                    <WaitingState />
                ) : (
                    <>
                        <TabsContent value="overview">
                            {allOffline ? (
                                <OfflineState
                                    title={offlineTarget ? `${offlineTarget.name || "This server"} went offline${offlineSince ? ` at ${offlineSince.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}` : "All servers are offline"}
                                    detail={offlineSince ? `${Math.max(1, Math.round((Date.now() - offlineSince.getTime()) / 60_000))} minutes ago · showing last known values` : "Opslin can't reach them · showing last known values"}
                                    lastKnown={lastKnown}
                                    fixHref={offlineTarget ? `/servers/${offlineTarget.id}` : "/servers"}
                                    onReconnect={retry}
                                />
                            ) : (
                                <OverviewTab
                                    range={range}
                                    score={score}
                                    serversTotal={rows.length}
                                    serversOnline={online}
                                    serversLabel={serversLabel}
                                    apps={apps}
                                    alerts={alerts}
                                    insights={insights}
                                    current={current}
                                    points={points}
                                    markers={markers}
                                    diskDays={diskDays}
                                    tourStep={showTour ? tourStep : -1}
                                    onOpenGuide={() => setGuideOpen(true)}
                                    onCreateAlert={() => setAlertOpen(true)}
                                    onSilence={(ruleId) => silence.mutate(ruleId)}
                                    silencing={silence.isPending}
                                />
                            )}
                        </TabsContent>
                        <TabsContent value="servers"><ServersTab rows={rows} /></TabsContent>
                        <TabsContent value="apps"><AppsTab apps={apps} /></TabsContent>
                    </>
                )}
            </Tabs>

            {showTour ? (
                <div role="status" className="fixed bottom-6 right-6 z-40 w-[min(320px,calc(100vw-3rem))] rounded-2xl border bg-background p-4 shadow-xl">
                    <div className="flex items-start gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{tourStep + 1}</span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">{TOUR[tourStep].title}</p>
                            <p className="text-xs text-muted-foreground">{TOUR[tourStep].body}</p>
                            <div className="mt-3 flex items-center justify-between">
                                <button type="button" onClick={finishTour} className="text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Skip tour</button>
                                <Button size="sm" onClick={() => (tourStep >= TOUR.length - 1 ? finishTour() : setTourStep(tourStep + 1))}>{tourStep >= TOUR.length - 1 ? "Done" : "Next"}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
            <CreateAlertDialog key={`${alertOpen}-${defaultAlertServer}`} open={alertOpen} onOpenChange={setAlertOpen} servers={liveTargets} defaultServerId={defaultAlertServer} points={points} rangeText={RANGE_LABEL[range].toLowerCase()} />
        </div>
    );
}
