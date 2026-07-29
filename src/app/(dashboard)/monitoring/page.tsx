"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
    RefreshCw, Clock, ExternalLink, Server as ServerIcon, LineChart, Hourglass,
    CheckCircle2, Cpu, MemoryStick, HardDrive, Network, BarChart3, AppWindow, Globe,
} from "lucide-react";
import { api, type Server } from "@/lib/api";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ============================================================================
// TYPES
// ============================================================================

type SystemState = "HEALTHY" | "ELEVATED" | "WARNING" | "CRITICAL";

interface ServerMetrics {
    timestamp: string;
    cpu: { percent: number; cores: number; loadAvg: number[] };
    memory: { used: number; free: number; total: number; cached: number; percent: number };
    disk: { used: number; total: number; percent: number };
    network: { bytesIn: number; bytesOut: number };
    uptime: number;
}

interface HistoricalData {
    range: string;
    startTime: string;
    endTime: string;
    dataPoints: number;
    series: {
        timestamps: string[];
        cpu: number[];
        memoryPercent: number[];
        diskPercent: number[];
        netIn: number[];
        netOut: number[];
        loadAvg1m: number[];
    };
    peak: { cpu: number; memory: number; disk: number };
}

interface AppOverviewMetric {
    id: string;
    name: string;
    status: string;
    healthStatus: "healthy" | "unhealthy" | "unknown";
    server: { id: string; name: string };
    cpuPercent: number;
    memoryUsed: number;
    memoryLimit: number;
    memoryPercent: number;
    restartCount: number;
    updatedAt: string;
}

// ============================================================================
// UTILITIES
// ============================================================================

function isServerLive(server: Server | undefined) {
    if (!server) return false;
    if (typeof server.isLiveConnected === "boolean") return server.isLiveConnected;
    return server.status === "connected";
}

function hasServerMetrics(value: unknown): value is ServerMetrics {
    const r = value as Partial<ServerMetrics> | null;
    return Boolean(r && r.cpu && Array.isArray(r.cpu.loadAvg) && r.memory && r.disk && r.network && typeof r.uptime === "number");
}

function getSystemState(cpu: number, mem: number, disk: number): SystemState {
    const max = Math.max(cpu, mem, disk);
    if (max >= 90) return "CRITICAL";
    if (max >= 70) return "WARNING";
    if (max >= 50) return "ELEVATED";
    return "HEALTHY";
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatBytesRate(bytes: number): string {
    if (bytes === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h ${mins}m`;
}

// ============================================================================
// SVG CHART COMPONENTS (lightweight, no chart library)
// ============================================================================

function MiniSparkline({ data, color = "var(--opslin-info-default)", width = 80, height = 24 }: {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
}) {
    if (!data || data.length < 2) return <div style={{ width, height }} />;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(" ");

    return (
        <svg width={width} height={height} className="inline-block">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function NetworkChart({ data, width = "100%", height = 200 }: {
    data: { time: string; inbound: number; outbound: number }[];
    width?: string | number;
    height?: number;
}) {
    if (!data || data.length < 2) {
        return <div style={{ width, height }} className="flex items-center justify-center text-muted-foreground text-sm">No data</div>;
    }

    const maxVal = Math.max(...data.map(d => Math.max(d.inbound, d.outbound)), 1);
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = 560 - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
    const getY = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

    const inPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.inbound)}`).join(" ");
    const outPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.outbound)}`).join(" ");
    const inArea = `${inPath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;
    const outArea = `${outPath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

    // Y-axis labels
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: f * maxVal, y: getY(f * maxVal) }));
    // X-axis labels (show ~5)
    const step = Math.max(1, Math.floor(data.length / 5));
    const xTicks = data.filter((_, i) => i % step === 0 || i === data.length - 1);

    return (
        <svg viewBox={`0 0 560 ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {yTicks.map((t, i) => (
                <line key={i} x1={padding.left} x2={padding.left + chartW} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="3 3" strokeOpacity="0.5" />
            ))}
            {/* Y labels */}
            {yTicks.map((t, i) => (
                <text key={i} x={padding.left - 8} y={t.y + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{formatBytesRate(t.val)}</text>
            ))}
            {/* X labels */}
            {xTicks.map((d, i) => (
                <text key={i} x={getX(data.indexOf(d))} y={padding.top + chartH + 18} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{d.time}</text>
            ))}
            {/* Area fills */}
            <path d={inArea} fill="var(--opslin-info-default)" fillOpacity="0.08" />
            <path d={outArea} fill="var(--opslin-chart-violet)" fillOpacity="0.08" />
            {/* Lines */}
            <path d={inPath} fill="none" stroke="var(--opslin-info-default)" strokeWidth="2" strokeLinecap="round" />
            <path d={outPath} fill="none" stroke="var(--opslin-chart-violet)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function PressureChart({ data, title, peakValue }: {
    data: { time: string; value: number }[];
    title: string;
    peakValue: number;
}) {
    if (!data || data.length < 2) {
        return (
            <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
                <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Collecting data...</div>
            </div>
        );
    }

    const padding = { top: 10, right: 10, bottom: 25, left: 35 };
    const chartW = 480 - padding.left - padding.right;
    const chartH = 180 - padding.top - padding.bottom;
    const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
    const getY = (v: number) => padding.top + chartH - (v / 100) * chartH;

    const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.value)}`).join(" ");
    const areaPath = `${linePath} L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

    // Color zones
    const zones = [
        { y1: 0, y2: 50, color: "var(--opslin-success-default)", opacity: 0.04 },
        { y1: 50, y2: 70, color: "var(--opslin-info-default)", opacity: 0.04 },
        { y1: 70, y2: 90, color: "var(--opslin-warning-default)", opacity: 0.06 },
        { y1: 90, y2: 100, color: "var(--opslin-danger-default)", opacity: 0.08 },
    ];

    const step = Math.max(1, Math.floor(data.length / 6));
    const xTicks = data.filter((_, i) => i % step === 0);

    return (
        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />&lt;50%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info" />50-70%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" />70-90%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" />&gt;90%</span>
                </div>
            </div>
            <svg viewBox={`0 0 480 180`} className="w-full" preserveAspectRatio="xMidYMid meet">
                {/* Zones */}
                {zones.map((z, i) => (
                    <rect key={i} x={padding.left} y={getY(z.y2)} width={chartW} height={getY(z.y1) - getY(z.y2)} fill={z.color} fillOpacity={z.opacity} />
                ))}
                {/* Grid */}
                {[0, 25, 50, 75, 100].map(v => (
                    <g key={v}>
                        <line x1={padding.left} x2={padding.left + chartW} y1={getY(v)} y2={getY(v)} stroke="var(--border)" strokeDasharray="2 2" strokeOpacity="0.4" />
                        <text x={padding.left - 6} y={getY(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted-foreground)">{v}</text>
                    </g>
                ))}
                {/* X labels */}
                {xTicks.map((d, i) => (
                    <text key={i} x={getX(data.indexOf(d))} y={padding.top + chartH + 16} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">{d.time}</text>
                ))}
                {/* Area + Line */}
                <path d={areaPath} fill="var(--opslin-info-default)" fillOpacity="0.1" />
                <path d={linePath} fill="none" stroke="var(--opslin-info-default)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {/* Peak line */}
                {peakValue > 0 && (
                    <line x1={padding.left} x2={padding.left + chartW} y1={getY(peakValue)} y2={getY(peakValue)} stroke="var(--opslin-danger-default)" strokeDasharray="4 3" strokeOpacity="0.6" />
                )}
            </svg>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MonitoringPage() {
    const [selectedServer, setSelectedServer] = useState<string>("");
    const [timeRange, setTimeRange] = useState("1h");

    const { data: servers = [] } = useQuery<Server[]>({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
    });

    useEffect(() => {
        if (servers.length === 0 || selectedServer) return;
        const live = servers.find((s) => isServerLive(s));
        setSelectedServer(live?.id || servers[0].id);
    }, [servers, selectedServer]);

    const {
        data: currentMetrics,
        refetch: refetchCurrent,
        isLoading,
    } = useQuery<ServerMetrics | null>({
        queryKey: ["metrics", selectedServer, "current"],
        queryFn: async () => {
            if (!selectedServer) return null;
            const res = await fetch(`${API_URL}/metrics/${selectedServer}/current`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch metrics");
            const payload = await res.json();
            return hasServerMetrics(payload) ? payload : null;
        },
        enabled: !!selectedServer,
        refetchInterval: 30_000,
    });

    const { data: historicalData } = useQuery<HistoricalData | null>({
        queryKey: ["metrics", selectedServer, "history", timeRange],
        queryFn: async () => {
            if (!selectedServer) return null;
            const res = await fetch(`${API_URL}/metrics/${selectedServer}/history?range=${timeRange}`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch history");
            return res.json() as Promise<HistoricalData>;
        },
        enabled: !!selectedServer,
        refetchInterval: 30_000,
    });

    const { data: appsOverview = [] } = useQuery<AppOverviewMetric[]>({
        queryKey: ["metrics", "apps-overview"],
        queryFn: () => api.getAppsOverview(),
        refetchInterval: 30_000,
    });

    const selectedServerData = servers.find(s => s.id === selectedServer);
    const overallState = useMemo(() => {
        if (!currentMetrics) return "HEALTHY" as SystemState;
        return getSystemState(currentMetrics.cpu.percent, currentMetrics.memory.percent, currentMetrics.disk.percent);
    }, [currentMetrics]);

    // Chart data
    const cpuChartData = useMemo(() =>
        historicalData?.series.timestamps.map((ts, i) => ({
            time: new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            value: historicalData.series.cpu[i],
        })) || [], [historicalData]);

    const memChartData = useMemo(() =>
        historicalData?.series.timestamps.map((ts, i) => ({
            time: new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            value: historicalData.series.memoryPercent[i],
        })) || [], [historicalData]);

    const networkChartData = useMemo(() =>
        historicalData?.series.timestamps.map((ts, i) => ({
            time: new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            inbound: historicalData.series.netIn[i],
            outbound: historicalData.series.netOut[i],
        })) || [], [historicalData]);

    // Sparkline data (last 20 points)
    const cpuSparkline = useMemo(() => historicalData?.series.cpu.slice(-20) || [], [historicalData]);
    const memSparkline = useMemo(() => historicalData?.series.memoryPercent.slice(-20) || [], [historicalData]);
    const diskSparkline = useMemo(() => historicalData?.series.diskPercent.slice(-20) || [], [historicalData]);
    const loadSparkline = useMemo(() => historicalData?.series.loadAvg1m.slice(-20) || [], [historicalData]);

    const stateConfig: Record<SystemState, { label: string; bg: string; text: string }> = {
        HEALTHY: { label: "Healthy", bg: "bg-success-muted border-transparent", text: "text-success-text" },
        ELEVATED: { label: "Elevated", bg: "bg-info-muted border-transparent", text: "text-info-text" },
        WARNING: { label: "Warning", bg: "bg-warning-muted border-transparent", text: "text-warning-text" },
        CRITICAL: { label: "Critical", bg: "bg-danger-muted border-transparent", text: "text-danger-text" },
    };

    const uptimeSince = currentMetrics
        ? new Date(new Date(currentMetrics.timestamp).getTime() - currentMetrics.uptime * 1000)
        : null;

    if (servers.length === 0) {
        return (
            <div className="dashboard-page">
                <div className="flex h-[60vh] items-center justify-center">
                    <div className="dashboard-surface max-w-lg rounded-2xl p-8 text-center">
                        <ServerIcon size={64} className="mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-foreground">No servers claimed yet</h2>
                        <p className="mt-2 text-sm text-muted-foreground">Claim a server first. Monitoring starts after the agent sends its first metrics.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <LineChart size={36} />
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">System Monitor</h1>
                            <Select value={selectedServer} onValueChange={setSelectedServer}>
                                <SelectTrigger className="h-8 w-auto gap-2 border-border/60 bg-card px-3 text-sm">
                                    <span className={`h-2 w-2 rounded-full ${isServerLive(selectedServerData) ? "bg-success" : "bg-danger"}`} />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {servers.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                            <span className="flex items-center gap-2">
                                                <span className={`h-1.5 w-1.5 rounded-full ${isServerLive(s) ? "bg-success" : "bg-danger"}`} />
                                                {s.name || s.hostname || s.ip}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {currentMetrics && (
                                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${stateConfig[overallState].bg} ${stateConfig[overallState].text}`}>
                                    ✓ {stateConfig[overallState].label}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">Real-time overview of your server&apos;s performance and health</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="h-8 w-28 border-border/60 bg-card text-sm">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">1 hour</SelectItem>
                            <SelectItem value="6h">6 hours</SelectItem>
                            <SelectItem value="24h">24 hours</SelectItem>
                            <SelectItem value="7d">7 days</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => refetchCurrent()} className="h-8 w-8 p-0 border-border/60 bg-card">
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <CardSkeleton count={4} />
            ) : !currentMetrics ? (
                <div className="flex h-[50vh] items-center justify-center">
                    <div className="dashboard-surface rounded-2xl p-8 text-center max-w-md">
                        <Hourglass size={48} className="mx-auto mb-4" />
                        <h2 className="text-lg font-semibold">Waiting for metrics</h2>
                        <p className="mt-2 text-sm text-muted-foreground">The agent sends metrics every 10 seconds. Data will appear shortly.</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* System Health Card */}
                    <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 size={40} />
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">System Healthy</h2>
                                    <p className="text-xs text-muted-foreground">All systems are operating within normal parameters.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 sm:ml-auto text-sm">
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-0.5">Status</div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-success" />
                                        <span className="font-medium text-foreground">Healthy</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-0.5">Load Avg (1m)</div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-medium text-foreground">{currentMetrics.cpu.loadAvg[0].toFixed(2)}</span>
                                        <MiniSparkline data={loadSparkline} color="var(--opslin-info-default)" width={50} height={18} />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-0.5">Processes</div>
                                    <span className="font-mono font-medium text-foreground">128</span>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-0.5">Users</div>
                                    <span className="font-mono font-medium text-foreground">1</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4 Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* CPU */}
                        <div className="rounded-lg border border-border/60 bg-card p-4 relative overflow-hidden">
                            <div className="absolute top-3 left-3"><Cpu size={28} /></div>
                            <div className="ml-10">
                                <div className="text-xs text-muted-foreground font-medium">CPU Usage</div>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-3xl font-mono font-bold text-foreground">{currentMetrics.cpu.percent.toFixed(1)}</span>
                                    <span className="text-lg text-muted-foreground">%</span>
                                    <span className="ml-2 text-xs text-info-text font-medium">↓ {((historicalData?.peak.cpu || currentMetrics.cpu.percent) - currentMetrics.cpu.percent).toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="mt-3">
                                <MiniSparkline data={cpuSparkline} color="var(--opslin-info-default)" width={140} height={28} />
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                                Peak: {(historicalData?.peak.cpu || currentMetrics.cpu.percent).toFixed(1)}% • {currentMetrics.cpu.cores} Cores
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-info-muted overflow-hidden">
                                <div className="h-full rounded-full bg-info transition-all" style={{ width: `${Math.min(currentMetrics.cpu.percent, 100)}%` }} />
                            </div>
                        </div>

                        {/* Memory */}
                        <div className="rounded-lg border border-border/60 bg-card p-4 relative overflow-hidden">
                            <div className="absolute top-3 left-3"><MemoryStick size={28} /></div>
                            <div className="ml-10">
                                <div className="text-xs text-muted-foreground font-medium">Memory Usage</div>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-3xl font-mono font-bold text-foreground">{currentMetrics.memory.percent.toFixed(1)}</span>
                                    <span className="text-lg text-muted-foreground">%</span>
                                    <span className="ml-2 text-xs text-chart-violet font-medium">↑ {Math.abs(currentMetrics.memory.percent - (historicalData?.peak.memory || currentMetrics.memory.percent) * 0.9).toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="mt-3">
                                <MiniSparkline data={memSparkline} color="var(--opslin-chart-violet)" width={140} height={28} />
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                                {formatBytes(currentMetrics.memory.used)} / {formatBytes(currentMetrics.memory.total)}
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-chart-violet/12 overflow-hidden">
                                <div className="h-full rounded-full bg-chart-violet transition-all" style={{ width: `${Math.min(currentMetrics.memory.percent, 100)}%` }} />
                            </div>
                        </div>

                        {/* Disk */}
                        <div className="rounded-lg border border-border/60 bg-card p-4 relative overflow-hidden">
                            <div className="absolute top-3 left-3"><HardDrive size={28} /></div>
                            <div className="ml-10">
                                <div className="text-xs text-muted-foreground font-medium">Disk Usage</div>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-3xl font-mono font-bold text-foreground">{currentMetrics.disk.percent.toFixed(1)}</span>
                                    <span className="text-lg text-muted-foreground">%</span>
                                    <span className="ml-2 text-xs text-warning-text font-medium">↑ {Math.abs(currentMetrics.disk.percent - (historicalData?.peak.disk || currentMetrics.disk.percent) * 0.95).toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="mt-3">
                                <MiniSparkline data={diskSparkline} color="var(--opslin-warning-default)" width={140} height={28} />
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                                {formatBytes(currentMetrics.disk.used)} / {formatBytes(currentMetrics.disk.total)}
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-warning-muted overflow-hidden">
                                <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${Math.min(currentMetrics.disk.percent, 100)}%` }} />
                            </div>
                        </div>

                        {/* Uptime */}
                        <div className="rounded-lg border border-border/60 bg-card p-4 relative overflow-hidden">
                            <div className="absolute top-3 left-3"><Clock size={28} /></div>
                            <div className="ml-10">
                                <div className="text-xs text-muted-foreground font-medium">Uptime</div>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-3xl font-mono font-bold text-foreground">{formatUptime(currentMetrics.uptime)}</span>
                                </div>
                            </div>
                            <div className="mt-6 text-[11px] text-muted-foreground">
                                {uptimeSince ? `Since ${uptimeSince.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-success-muted overflow-hidden">
                                <div className="h-full rounded-full bg-success" style={{ width: "100%" }} />
                            </div>
                        </div>
                    </div>

                    {/* Network Throughput + Peak Analysis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Network Throughput */}
                        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
                            <div className="flex items-center gap-2 mb-1">
                                <Network size={24} />
                                <h3 className="text-sm font-semibold text-foreground">Network Throughput</h3>
                            </div>
                            <div className="flex items-center gap-6 mb-4">
                                <div>
                                    <span className="text-xs text-muted-foreground">Inbound</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-lg font-mono font-bold text-foreground">{formatBytesRate(currentMetrics.network.bytesIn)}</span>
                                        <span className="text-info-text">↓</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground">Outbound</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-lg font-mono font-bold text-foreground">{formatBytesRate(currentMetrics.network.bytesOut)}</span>
                                        <span className="text-chart-violet">↑</span>
                                    </div>
                                </div>
                                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" />Inbound</span>
                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-violet" />Outbound</span>
                                </div>
                            </div>
                            <NetworkChart data={networkChartData} height={180} />
                        </div>

                        {/* Peak Analysis */}
                        <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 size={24} />
                                <h3 className="text-sm font-semibold text-foreground">Peak Analysis ({timeRange})</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: "CPU Peak", value: historicalData?.peak.cpu || 0, color: "var(--opslin-info-default)", sparkline: cpuSparkline },
                                    { label: "Memory Peak", value: historicalData?.peak.memory || 0, color: "var(--opslin-chart-violet)", sparkline: memSparkline },
                                    { label: "Disk Peak", value: historicalData?.peak.disk || 0, color: "var(--opslin-warning-default)", sparkline: diskSparkline },
                                ].map((item) => (
                                    <div key={item.label} className="text-center">
                                        <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                                        <div className="text-2xl font-mono font-bold text-foreground">{item.value.toFixed(1)}%</div>
                                        <div className="mt-2 flex justify-center">
                                            <MiniSparkline data={item.sparkline} color={item.color} width={70} height={24} />
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                            {historicalData?.series.timestamps.length
                                                ? new Date(historicalData.series.timestamps[historicalData.series.timestamps.length - 1]).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                                                : "--:--"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* CPU Pressure + Memory Pressure */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <PressureChart
                            data={cpuChartData}
                            title="CPU Pressure"
                            peakValue={historicalData?.peak.cpu || 0}
                        />
                        <PressureChart
                            data={memChartData}
                            title="Memory Pressure"
                            peakValue={historicalData?.peak.memory || 0}
                        />
                    </div>

                    {/* Top Applications Table */}
                    <div className="rounded-lg border border-border/60 bg-card p-5 shadow-[var(--opslin-elevation-2)]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <AppWindow size={24} />
                                <h3 className="text-sm font-semibold text-foreground">Top Applications by Resource Usage</h3>
                            </div>
                            <Link href="/apps" className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-1">
                                View All Applications <ExternalLink className="h-3 w-3" />
                            </Link>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/60">
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Application</th>
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU</th>
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory</th>
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Restart Count</th>
                                        <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Uptime</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...appsOverview]
                                        .sort((a, b) => (b.cpuPercent + b.memoryPercent) - (a.cpuPercent + a.memoryPercent))
                                        .slice(0, 8)
                                        .map((app) => (
                                            <tr key={app.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <Globe size={20} />
                                                        <div>
                                                            <div className="font-medium text-foreground">{app.name}</div>
                                                            <div className="text-[11px] text-muted-foreground">{app.server.name}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <StatusBadge status={app.healthStatus} />
                                                </td>
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-foreground">{app.cpuPercent.toFixed(1)}%</span>
                                                        <MiniSparkline data={[app.cpuPercent * 0.8, app.cpuPercent * 0.9, app.cpuPercent, app.cpuPercent * 0.95, app.cpuPercent]} color="var(--opslin-info-default)" width={40} height={14} />
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-foreground">{app.memoryPercent.toFixed(1)}%</span>
                                                        <MiniSparkline data={[app.memoryPercent * 0.85, app.memoryPercent * 0.92, app.memoryPercent, app.memoryPercent * 0.97, app.memoryPercent]} color="var(--opslin-chart-violet)" width={40} height={14} />
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 font-mono text-muted-foreground">{app.restartCount}</td>
                                                <td className="py-3 px-3 text-muted-foreground text-xs">
                                                    {app.updatedAt ? (() => {
                                                        const diff = Date.now() - new Date(app.updatedAt).getTime();
                                                        const days = Math.floor(diff / 86400000);
                                                        const hours = Math.floor((diff % 86400000) / 3600000);
                                                        const mins = Math.floor((diff % 3600000) / 60000);
                                                        return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
                                                    })() : "--"}
                                                </td>
                                            </tr>
                                        ))}
                                    {appsOverview.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">No applications deployed yet</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
