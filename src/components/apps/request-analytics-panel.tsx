"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Gauge, Globe2 } from "lucide-react";
import { api, type RequestFeedEvent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { chartColors, colorMix } from "@/lib/design-system";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type LatencyPoint = { bucket: string; p50: number; p95: number; p99: number };

function statusBadge(status: number) {
    if (status >= 500) return "bg-chart-3/15 text-chart-3";
    if (status >= 400) return "bg-chart-4/15 text-chart-4";
    if (status >= 300) return "bg-chart-2/15 text-chart-2";
    return "bg-chart-5/15 text-chart-5";
}

function LatencyPercentilesChart({ data }: { data: LatencyPoint[] }) {
    const recharts = useRecharts();

    if (!recharts) {
        return <ChartLoading className="h-[220px]" />;
    }

    const {
        Line,
        LineChart,
        ResponsiveContainer,
        Tooltip,
        XAxis,
        YAxis,
    } = recharts;

    return (
        <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
                <XAxis dataKey="bucket" hide />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="p50" stroke={chartColors.primary} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="p95" stroke={chartColors.info} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="p99" stroke={chartColors.danger} dot={false} strokeWidth={2} />
            </LineChart>
        </ResponsiveContainer>
    );
}

export function RequestAnalyticsPanel({
    appId,
    enabled = true,
    refreshIntervalMs = 60_000,
}: {
    appId: string;
    enabled?: boolean;
    refreshIntervalMs?: number;
}) {
    const [window, setWindow] = useState<"1h" | "24h" | "7d">("1h");
    const [methodFilter, setMethodFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [pathFilter, setPathFilter] = useState("");
    const [paused, setPaused] = useState(false);
    const [droppedEvents, setDroppedEvents] = useState(0);
    const [streamEvents, setStreamEvents] = useState<RequestFeedEvent[]>([]);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const feedQuery = useQuery({
        queryKey: ["requestFeed", appId, window, methodFilter, statusFilter, pathFilter],
        queryFn: () => api.getRequestFeed(appId, {
            window,
            method: methodFilter === "all" ? undefined : methodFilter,
            status: statusFilter === "all" ? undefined : statusFilter,
            path: pathFilter || undefined,
        }),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    const latencyQuery = useQuery({
        queryKey: ["requestLatency", appId, window],
        queryFn: () => api.getRequestLatency(appId, window),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    const errorsQuery = useQuery({
        queryKey: ["requestErrors", appId, window],
        queryFn: () => api.getRequestErrors(appId, window),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    const heatmapQuery = useQuery({
        queryKey: ["requestHeatmap", appId],
        queryFn: () => api.getRequestHeatmap(appId),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    const slowestQuery = useQuery({
        queryKey: ["requestSlowest", appId, window],
        queryFn: () => api.getSlowestEndpoints(appId, window),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let socket: WebSocket | null = null;
        let disposed = false;
        const connectTimer = globalThis.setTimeout(() => {
            if (disposed) {
                return;
            }

            socket = new WebSocket(
                `${API_URL.replace(/^http/, "ws")}/metrics/apps/${appId}/requests/live`
            );

            socket.onmessage = (event) => {
                if (paused) {
                    return;
                }
                const payload = JSON.parse(event.data) as {
                    events?: RequestFeedEvent[];
                    droppedEvents?: number;
                };
                if (payload.droppedEvents) {
                    setDroppedEvents(payload.droppedEvents);
                }
                const events = Array.isArray(payload.events) ? payload.events : [];
                if (events.length === 0) {
                    return;
                }
                setStreamEvents((previous) => [...previous, ...events].slice(-100));
            };
        }, 50);

        return () => {
            disposed = true;
            globalThis.clearTimeout(connectTimer);
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close();
            }
        };
    }, [appId, enabled, paused]);

    const liveEvents = useMemo(() => {
        const seedEvents = feedQuery.data?.events || [];
        return [...seedEvents, ...streamEvents].slice(-100);
    }, [feedQuery.data?.events, streamEvents]);

    useEffect(() => {
        if (paused || !scrollRef.current) {
            return;
        }
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [liveEvents, paused]);

    const filteredEvents = useMemo(() => {
        return liveEvents.filter((event) => {
            if (methodFilter !== "all" && event.method !== methodFilter) {
                return false;
            }
            if (statusFilter !== "all" && String(event.status) !== statusFilter) {
                return false;
            }
            if (pathFilter.trim() && !`${event.path} ${event.pathNormalized}`.toLowerCase().includes(pathFilter.toLowerCase())) {
                return false;
            }
            return true;
        });
    }, [liveEvents, methodFilter, statusFilter, pathFilter]);

    const latencyData = latencyQuery.data?.series || [];
    const heatmapBuckets = useMemo(() => {
        const totals = new Map<string, number>();
        for (const row of heatmapQuery.data?.rows || []) {
            totals.set(row.bucket, (totals.get(row.bucket) || 0) + row.count);
        }
        return Array.from(totals.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .slice(-24);
    }, [heatmapQuery.data?.rows]);
    const maxHeat = Math.max(1, ...heatmapBuckets.map(([, count]) => count));

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Globe2 className="h-5 w-5" />
                            Request Analytics
                        </CardTitle>
                        <CardDescription>
                            Live request feed, latency percentiles, grouped errors, traffic heatmap, and slow endpoints.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {droppedEvents > 0 && (
                            <Badge className="bg-chart-4/15 text-chart-4">
                                {droppedEvents} dropped
                            </Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setPaused((value) => !value)}>
                            {paused ? "Resume Live Feed" : "Pause Live Feed"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-wrap items-center gap-2">
                        {(["1h", "24h", "7d"] as const).map((value) => (
                            <Button
                                key={value}
                                size="sm"
                                variant={window === value ? "default" : "outline"}
                                onClick={() => setWindow(value)}
                            >
                                {value}
                            </Button>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                                <Activity className="h-4 w-4" />
                                Latency Percentiles
                            </p>
                            <LatencyPercentilesChart data={latencyData} />
                        </div>

                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                                <Gauge className="h-4 w-4" />
                                Slowest Endpoints
                            </p>
                            <div className="space-y-3">
                                {(slowestQuery.data?.rows || []).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No slow endpoints yet.</p>
                                ) : (
                                    slowestQuery.data?.rows.map((row) => (
                                        <div key={row.pathNormalized} className="rounded-lg border border-border/70 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="truncate font-medium text-foreground">{row.pathNormalized}</p>
                                                <Badge variant="outline">{row.p95.toFixed(1)} ms p95</Badge>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{row.requests} requests</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                                <AlertTriangle className="h-4 w-4" />
                                Error Groups
                            </p>
                            <div className="space-y-3">
                                {(errorsQuery.data?.rows || []).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No grouped errors in this window.</p>
                                ) : (
                                    errorsQuery.data?.rows.map((row) => (
                                        <div key={`${row.pathNormalized}-${row.status}`} className="rounded-lg border border-border/70 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="truncate font-medium text-foreground">{row.pathNormalized}</p>
                                                <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{row.count} hits · sample {row.samplePath}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="mb-4 text-sm font-medium text-foreground">24h Traffic Heatmap</p>
                            <div className="grid grid-cols-6 gap-2">
                                {heatmapBuckets.length === 0 ? (
                                    <p className="col-span-6 text-sm text-muted-foreground">No traffic buckets yet.</p>
                                ) : (
                                    heatmapBuckets.map(([bucket, count]) => (
                                        <div key={bucket} className="space-y-1">
                                            <div
                                                className="h-10 rounded-md"
                                                style={{
                                                    backgroundColor: colorMix(chartColors.info, Math.max(15, (count / maxHeat) * 100)),
                                                }}
                                                title={`${bucket}: ${count} requests`}
                                            />
                                            <p className="truncate text-[10px] text-muted-foreground">
                                                {new Date(bucket).toLocaleTimeString([], { hour: "2-digit" })}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Live Feed</CardTitle>
                    <CardDescription>
                        Last 100 requests with method, path, status, latency, and normalized route.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[140px_140px_1fr]">
                        <select
                            className="border-input bg-background text-foreground h-10 rounded-md border px-3 text-sm"
                            value={methodFilter}
                            onChange={(event) => setMethodFilter(event.target.value)}
                        >
                            <option value="all">All methods</option>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                        <select
                            className="border-input bg-background text-foreground h-10 rounded-md border px-3 text-sm"
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                        >
                            <option value="all">All status</option>
                            <option value="200">200</option>
                            <option value="301">301</option>
                            <option value="404">404</option>
                            <option value="500">500</option>
                        </select>
                        <Input
                            value={pathFilter}
                            onChange={(event) => setPathFilter(event.target.value)}
                            placeholder="Filter by path"
                        />
                    </div>

                    <div
                        ref={scrollRef}
                        className="max-h-[32rem] overflow-auto rounded-xl border border-border/70 bg-card"
                    >
                        <div className="min-w-[720px] divide-y divide-border/50">
                            {filteredEvents.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">No requests captured yet.</div>
                            ) : (
                                filteredEvents.map((event) => (
                                    <div key={`${event.requestId}-${event.timestamp}`} className="grid grid-cols-[90px_1fr_90px_120px] gap-3 p-3 text-sm">
                                        <div className="space-y-1">
                                            <Badge variant="outline">{event.method}</Badge>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(event.timestamp).toLocaleTimeString()}
                                            </p>
                                        </div>
                                        <div className="space-y-1 overflow-hidden">
                                            <p className="truncate font-medium text-foreground">{event.path}</p>
                                            <p className="truncate text-xs text-muted-foreground">{event.pathNormalized}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Badge className={statusBadge(event.status)}>{event.status}</Badge>
                                            <p className="text-xs text-muted-foreground">{event.country || "ZZ"}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-foreground">{event.responseMs.toFixed(1)} ms</p>
                                            <p className="text-xs text-muted-foreground">upstream {event.upstreamMs.toFixed(1)} ms</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
