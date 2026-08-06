"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, HeartPulse, MemoryStick, RotateCcw, Timer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type DeploymentRecord } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import { formatBytes, memoryPercent, resolveEffectiveHealthLabel } from "@/lib/live-monitor";
import { chartColors } from "@/lib/design-system";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type LiveMetricPoint = { timestamp: string; cpu: number; memory: number };

const HEALTH_DISPLAY: Record<ReturnType<typeof resolveEffectiveHealthLabel>, { label: string; tone: string }> = {
  offline: { label: "Offline", tone: "bg-secondary text-muted-foreground border-border" },
  stale: { label: "Stale", tone: "bg-warning-muted text-warning-text border-warning/30" },
  unhealthy: { label: "Unhealthy", tone: "bg-danger-muted text-danger-text border-danger/30" },
  healthy: { label: "Healthy", tone: "bg-success-muted text-success-text border-success/30" },
  unknown: { label: "Unknown", tone: "bg-secondary text-muted-foreground border-border" },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-6" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-2" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LiveMonitorChart({ chartData }: { chartData: LiveMetricPoint[] }) {
  const recharts = useRecharts();

  if (!recharts) {
    return <ChartLoading className="h-48" />;
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
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <XAxis dataKey="timestamp" hide />
        <YAxis hide domain={[0, 100]} />
        <Tooltip />
        <Line type="monotone" dataKey="cpu" stroke={chartColors.primary} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="memory" stroke={chartColors.info} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AppLiveMonitor({
  appId,
  serverId,
  deployments = [],
  enabled = true,
  refreshIntervalMs = 60_000,
}: {
  appId: string;
  serverId: string;
  deployments?: DeploymentRecord[];
  enabled?: boolean;
  refreshIntervalMs?: number;
}) {
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "closed">("connecting");
  const [lastLiveMessageAt, setLastLiveMessageAt] = useState<string | null>(null);

  // Query keys deliberately match AppObservabilityPanel's (same appId, same default "1h"
  // range) — both panels render together in MetricsSection, and this lets React Query dedupe
  // them into one shared poll instead of two independent 60s intervals hitting the same data.
  const { data: current } = useQuery({
    queryKey: ["appMetricsCurrent", appId],
    queryFn: () => api.getAppMetricsCurrent(appId),
    enabled,
    refetchInterval: enabled ? refreshIntervalMs : false,
  });

  const { data: history } = useQuery({
    queryKey: ["appMetricsHistory", appId, "1h"],
    queryFn: () => api.getAppMetricsHistory(appId, "1h"),
    enabled,
    refetchInterval: enabled ? refreshIntervalMs : false,
  });

  useEffect(() => {
    if (!enabled) {
      setConnectionState("closed");
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnectionState((previous) => previous === "closed" ? "connecting" : previous);
      socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/metrics/${serverId}/live`);
      socket.onopen = () => setConnectionState("connected");
      socket.onmessage = () => setLastLiveMessageAt(new Date().toISOString());
      socket.onclose = () => {
        if (disposed) return;
        setConnectionState("reconnecting");
        reconnectTimer = window.setTimeout(connect, 2500);
      };
      socket.onerror = () => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
      setConnectionState("closed");
    };
  }, [enabled, refreshIntervalMs, serverId]);

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.series.timestamps.map((timestamp, index) => ({
      timestamp,
      cpu: history.series.cpu[index] || 0,
      memory: history.series.memoryPercent[index] || 0,
    }));
  }, [history]);

  const healthDisplay = HEALTH_DISPLAY[resolveEffectiveHealthLabel(current)];
  const latestDeploy = deployments[0];
  const memory = memoryPercent(current);

  return (
    <Card className="dashboard-surface" data-testid="app-live-monitor">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
            <HeartPulse size={20} />
          </div>
          <div>
            <CardTitle className="text-lg">Live App Monitor</CardTitle>
            <CardDescription>
              Real-time container health, resource usage, and deployment context.
            </CardDescription>
          </div>
        </div>
        <Badge className={
          connectionState === "connected"
            ? "bg-info-muted text-info-text border border-info/30 font-semibold"
            : "bg-warning-muted text-warning-text border border-warning/30 font-semibold"
        }>
          <span className={
            "inline-block h-1.5 w-1.5 rounded-full mr-1.5 " +
            (connectionState === "connected" ? "bg-info animate-pulse" : "bg-warning")
          } />
          {connectionState === "reconnecting" ? "RECONNECTING" : connectionState.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <Cpu className="size-4 text-info-text" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">CPU</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{(current?.cpuPercent || 0).toFixed(1)}%</p>
            <MiniSparkline data={history?.series.cpu?.slice(-20) || []} color="var(--opslin-info-default)" />
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <MemoryStick className="size-4 text-chart-violet" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Memory</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{memory.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(current?.memoryUsed)} / {formatBytes(current?.memoryLimit)}</p>
            <MiniSparkline data={history?.series.memoryPercent?.slice(-20) || []} color="var(--opslin-chart-violet)" />
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <RotateCcw className="size-4 text-warning-text" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Restarts</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{current?.restartCount || 0}</p>
            <MiniSparkline data={history?.series.restartCount?.slice(-20) || []} color="var(--opslin-warning-default)" />
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <HeartPulse className={
                "size-4 " +
                (healthDisplay.label === "Healthy" ? "text-success-text" :
                 healthDisplay.label === "Unhealthy" ? "text-danger-text" : "text-muted-foreground")
              } />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Health</span>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">{healthDisplay.label}</p>
            <Badge className={"mt-2 border " + healthDisplay.tone}>
              {healthDisplay.label.toUpperCase()}
            </Badge>
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <Timer className="size-4 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Last deploy</span>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">
              {latestDeploy ? formatRelativeTime(latestDeploy.finishedAt || latestDeploy.startedAt) : "No deploy"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {latestDeploy?.sha ? latestDeploy.sha.slice(0, 7) : "—"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <p className="text-sm font-medium text-foreground">Last hour CPU and memory</p>
            <div className="mt-4 h-48">
              <LiveMonitorChart chartData={chartData} />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4 text-sm">
            <p className="font-medium text-foreground">Container</p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {current?.containerId || "pending"}
            </p>
            <p className="mt-4 font-medium text-foreground">Telemetry</p>
            <p className="mt-2 text-muted-foreground">
              {lastLiveMessageAt ? `Last live packet ${formatRelativeTime(lastLiveMessageAt)}` : "Waiting for live packet"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
