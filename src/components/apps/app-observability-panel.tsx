"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestAnalyticsPanel } from "@/components/apps/request-analytics-panel";
import { EnhancedLogViewer } from "@/components/logs/enhanced-log-viewer";
import { PlanGate } from "@/components/PlanGate";
import type { LogLineRecord } from "@/components/logs/log-viewer";
import { chartColors } from "@/lib/design-system";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

type RuntimeLogLine = LogLineRecord;
type AppMetricPoint = { timestamp: string; cpu: number; memory: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function healthBadgeClass(status: string) {
    switch (status) {
        case "healthy":
            return "bg-chart-5/15 text-chart-5";
        case "unhealthy":
            return "bg-chart-3/15 text-chart-3";
        default:
            return "bg-secondary text-muted-foreground";
    }
}

function AppMetricsSparklines({ chartData }: { chartData: AppMetricPoint[] }) {
    const recharts = useRecharts();

    if (!recharts) {
        return (
            <div className="grid gap-4 lg:grid-cols-2">
                <ChartLoading className="h-[244px]" />
                <ChartLoading className="h-[244px]" />
            </div>
        );
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
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-card p-4">
                <p className="mb-4 text-sm font-medium text-foreground">CPU Sparkline</p>
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                        <XAxis dataKey="timestamp" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="cpu" stroke={chartColors.primary} dot={false} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4">
                <p className="mb-4 text-sm font-medium text-foreground">Memory Sparkline</p>
                <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                        <XAxis dataKey="timestamp" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="memory" stroke={chartColors.info} dot={false} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function AppObservabilityPanel({
    appId,
    enabled = true,
    refreshIntervalMs = 60_000,
}: {
    appId: string;
    enabled?: boolean;
    refreshIntervalMs?: number;
}) {
    const [range, setRange] = useState<"1h" | "24h">("1h");
    const [throttled, setThrottled] = useState(false);
    const [lines, setLines] = useState<RuntimeLogLine[]>([]);

    const { data: current } = useQuery({
        queryKey: ["appMetricsCurrent", appId],
        queryFn: () => api.getAppMetricsCurrent(appId),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    const { data: history } = useQuery({
        queryKey: ["appMetricsHistory", appId, range],
        queryFn: () => api.getAppMetricsHistory(appId, range),
        enabled,
        refetchInterval: enabled ? refreshIntervalMs : false,
    });

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let socket: WebSocket | null = null;
        let disposed = false;
        const connectTimer = window.setTimeout(() => {
            if (disposed) {
                return;
            }

            socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/apps/${appId}/logs`);
            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data) as {
                    lines?: RuntimeLogLine[];
                    throttled?: boolean;
                };
                if (payload.throttled) {
                    setThrottled(true);
                }
                const incoming = Array.isArray(payload.lines) ? payload.lines : [];
                if (incoming.length === 0) {
                    return;
                }
                setLines((previous) => [
                    ...previous,
                    ...incoming.map((line, index) => ({
                        ...line,
                        id: `${line.timestamp || Date.now()}-${index}-${line.message || "line"}`,
                        source: line.source || "runtime",
                    })),
                ].slice(-10000));
            };
            socket.onclose = () => {
                // Silent reconnect is handled by page refresh/query polling.
            };
        }, 50);

        return () => {
            disposed = true;
            window.clearTimeout(connectTimer);
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close();
            }
        };
    }, [appId, enabled]);

    const chartData = useMemo(() => {
        if (!history) {
            return [];
        }
        return history.series.timestamps.map((timestamp, index) => ({
            timestamp,
            cpu: history.series.cpu[index] || 0,
            memory: history.series.memoryPercent[index] || 0,
        }));
    }, [history]);

    return (
        <div className="space-y-6" id="app-runtime-observability">
            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Runtime Observability
                        </CardTitle>
                        <CardDescription>
                            Health, restarts, and rolling CPU/memory usage from container telemetry.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge className={healthBadgeClass(current?.healthStatus || "unknown")}>
                            {(current?.healthStatus || "unknown").toUpperCase()}
                        </Badge>
                        <Badge variant="outline">
                            {current?.restartCount || 0} restarts
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">CPU</p>
                            <p className="mt-2 text-3xl font-semibold text-foreground">{(current?.cpuPercent || 0).toFixed(1)}%</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Memory</p>
                            <p className="mt-2 text-3xl font-semibold text-foreground">{(current?.memoryPercent || 0).toFixed(1)}%</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Network In</p>
                            <p className="mt-2 text-3xl font-semibold text-foreground">{Math.round((current?.netInput || 0) / 1024)} KB</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Network Out</p>
                            <p className="mt-2 text-3xl font-semibold text-foreground">{Math.round((current?.netOutput || 0) / 1024)} KB</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant={range === "1h" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setRange("1h")}
                        >
                            1h Raw
                        </Button>
                        <Button
                            variant={range === "24h" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setRange("24h")}
                        >
                            24h Downsampled
                        </Button>
                    </div>

                    <AppMetricsSparklines chartData={chartData} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg">Runtime Logs</CardTitle>
                        <CardDescription>
                            Live container output with level filter, regex search, and throttling indicator.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {throttled && (
                            <Badge className="bg-chart-4/15 text-chart-4">THROTTLED</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <EnhancedLogViewer
                        lines={lines}
                        title="Runtime log stream"
                        description="ANSI-aware virtualized live logs with regex search, level filters, auto-scroll, and download."
                        fileName={`opslin-${appId}-runtime.log`}
                    />
                </CardContent>
            </Card>

            <PlanGate feature="logs.requestAnalytics">
                <RequestAnalyticsPanel appId={appId} enabled={enabled} refreshIntervalMs={refreshIntervalMs} />
            </PlanGate>
        </div>
    );
}
