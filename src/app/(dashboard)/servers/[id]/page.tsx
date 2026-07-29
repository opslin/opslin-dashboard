"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, Box, CheckCircle2, ChevronRight,
  Clock, Copy, Database as DatabaseIcon, ExternalLink, FileText, Globe,
  HardDrive, Info, MoreHorizontal, MonitorDot, Plus, Power, RefreshCw,
  Server, Shield, ShieldCheck, Terminal, Trash2, Wifi, WifiOff, ServerCog,
  TerminalSquare, Package, HeartPulse, Container, RotateCw,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type App, type Database as DatabaseRecord } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { ServerObservabilityPanel } from "@/components/servers/server-observability-panel";
import { ServerDriftPanel } from "@/components/servers/server-drift-panel";
import { AgentInstallCommands } from "@/components/servers/agent-install-commands";
import { AgentUpdateModal } from "@/components/servers/agent-update-modal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "running":
      return "bg-success-muted text-success-text border-success/30";
    case "deploying":
      return "bg-info-muted text-info-text border-info/30";
    case "pending":
      return "bg-warning-muted text-warning-text border-warning/30";
    case "stopped":
      return "bg-muted/40 text-muted-foreground border-border";
    case "deleting":
    case "delete_failed":
      return "bg-danger-muted text-danger-text border-danger/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function dbStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "running":
      return "bg-success-muted text-success-text border-success/30";
    case "creating":
      return "bg-info-muted text-info-text border-info/30";
    case "stopped":
      return "bg-muted/40 text-muted-foreground border-border";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function portStatusLabel(status?: string | null) {
  switch (status) {
    case "available":
      return "available";
    case "opslin_listening":
      return "in use by Opslin";
    case "occupied_by_other":
      return "blocked";
    default:
      return "unknown";
  }
}

function fmtServerUptime(connectedAt?: string | null) {
  if (!connectedAt) return "—";
  const ms = Date.now() - new Date(connectedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function domainReadinessReady(readiness: Awaited<ReturnType<typeof api.getServer>>["domainReadiness"] | undefined) {
  return Boolean(
    readiness?.dockerReady &&
      readiness.helperReady &&
      readiness.proxyReady &&
      readiness.canManageRoutes &&
      readiness.canIssueSsl &&
      readiness.supportsPrivilegedJobs
  );
}

function agentUpdateLabel(info?: Awaited<ReturnType<typeof api.getAgentUpdateInfo>>) {
  const active = info?.activeUpdateJob;
  if (active?.status === "PENDING") return "Queued";
  if (active?.status === "RUNNING") return "Updating";
  const last = info?.lastUpdateJob;
  if (last?.status === "FAILED") return "Failed";
  if (info?.queueAvailable === false) return "Queue unavailable";
  if (info?.jobStoreAvailable === false) return "Update unavailable";
  if (info && info.currentVersion === info.latestVersion) return "Updated";
  if (info?.updateAvailable) return "Update Available";
  return "Agent update";
}

// ---------------------------------------------------------------------------
// Sparkline (mini chart)
// ---------------------------------------------------------------------------

function Sparkline({ values, color = "var(--opslin-info-default)" }: { values: number[]; color?: string }) {
  if (values.length === 0) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const stepX = w / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status mini-card (top row)
// ---------------------------------------------------------------------------

function StatusMiniCard({
  label,
  value,
  detail,
  icon,
  iconBg,
  iconColor,
  badge,
  badgeClass,
  chart,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  badgeClass?: string;
  chart?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {badge ? (
          <span className={cn("inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded", badgeClass)}>
            {badge}
          </span>
        ) : icon ? (
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", iconBg)}>
            <span className={iconColor}>{icon}</span>
          </div>
        ) : null}
      </div>
      <p className="mt-1.5 text-base font-semibold text-foreground leading-tight">{value}</p>
      {detail ? <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{detail}</p> : null}
      {chart ? <div className="mt-2">{chart}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick action card (Agent 2.0 Secure Control)
// ---------------------------------------------------------------------------

const SECURE_CONTROL_ACTIONS: Array<{
  action: string;
  label: string;
  description: string;
  icon3d: LucideIcon;
}> = [
  { action: "agent_status", label: "Status", description: "Check agent and helper services", icon3d: Info },
  { action: "agent_logs", label: "Logs", description: "Fetch recent agent logs", icon3d: FileText },
  { action: "system_health", label: "Health", description: "Read uptime and disk state", icon3d: HeartPulse },
  { action: "docker_ps", label: "Containers", description: "List Opslin-managed containers", icon3d: Container },
  { action: "agent_restart", label: "Restart Agent", description: "Restart only the Opslin agent", icon3d: RotateCw },
];

function SecureControlCard({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const { data: info } = useQuery({
    queryKey: ["agent-control", serverId],
    queryFn: () => api.getAgentControl(serverId),
    enabled: Boolean(serverId),
    refetchInterval: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: (payload: { action: string; args?: Record<string, unknown> }) =>
      api.runAgentControlAction(serverId, { action: payload.action as never, args: payload.args }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-control", serverId] });
      toast.success("Action queued");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Action failed");
    },
  });

  const helperReady = info?.helperStatus === "active" || info?.helperStatus === "available";
  const disabled = !info?.connected || !info?.isSecureControlCapable || !info.secureControl || !helperReady;

  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={36} />
            <div>
              <h2 className="text-sm font-bold text-foreground">Agent 2.0 Secure Control</h2>
              <p className="text-[11px] text-muted-foreground">Controlled VPS actions without exposing a root terminal.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Agent v{info?.currentVersion || "—"}</span>
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border",
              helperReady
                ? "text-success-text bg-success-muted border-success/30"
                : "text-muted-foreground bg-muted/40 border-border"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", helperReady ? "bg-success" : "bg-muted-foreground/40")} />
              Helper {helperReady ? "active" : info?.helperStatus || "inactive"}
            </span>
          </div>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SECURE_CONTROL_ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              disabled={disabled || actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: item.action, args: item.action === "agent_logs" ? { lines: 120 } : undefined })}
              className={cn(
                "rounded-xl border border-border bg-card px-3 py-3 text-left",
                "hover:border-border hover:bg-muted/40 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
              )}
            >
              <item.icon3d size={36} className="mb-2" />
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
            </button>
          ))}
        </div>

        {/* Bottom status row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Running Job</p>
            <p className="text-xs font-medium text-foreground mt-1">
              {info?.runningJob ? `${info.runningJob.type || "Action"}` : "No running agent job"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last Privileged Action</p>
            <p className="text-xs font-medium text-foreground mt-1 flex items-center gap-1.5">
              {info?.lastPrivilegedAction ? (
                <>
                  {info.lastPrivilegedAction.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-warning-text" />
                  )}
                  <span>{info.lastPrivilegedAction.status}</span>
                  <span className="text-muted-foreground">
                    {info.lastPrivilegedAction.endedAt
                      ? formatRelativeTime(info.lastPrivilegedAction.endedAt)
                      : ""}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No privileged action yet</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Server fact row (right column)
// ---------------------------------------------------------------------------

function FactRow({
  icon,
  label,
  value,
  copyable,
  badge,
  badgeClass,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  copyable?: boolean;
  badge?: string;
  badgeClass?: string;
  action?: React.ReactNode;
}) {
  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 text-muted-foreground min-w-[110px]">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        <span className="text-xs text-foreground font-mono truncate" title={value}>{value}</span>
        {badge ? (
          <span className={cn("inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0", badgeClass)}>
            {badge}
          </span>
        ) : null}
        {copyable ? (
          <button onClick={handleCopy} className="text-muted-foreground hover:text-muted-foreground flex-shrink-0" aria-label={`Copy ${label}`}>
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
        {action}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;
  const [agentUpdateOpen, setAgentUpdateOpen] = useState(false);

  const { data: server, isLoading, error } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => api.getServer(serverId),
    enabled: Boolean(serverId),
  });

  const { data: apps = [] } = useQuery<App[]>({
    queryKey: ["apps", serverId],
    queryFn: () => api.getApps(serverId),
    enabled: Boolean(serverId),
  });

  const { data: databases = [] } = useQuery<DatabaseRecord[]>({
    queryKey: ["databases", serverId],
    queryFn: () => api.getDatabases(serverId),
    enabled: Boolean(serverId),
  });

  const { data: firewallState } = useQuery({
    queryKey: ["firewall-state", serverId],
    queryFn: () => api.getFirewallState(serverId),
    enabled: Boolean(serverId),
  });

  const { data: agentUpdateInfo } = useQuery({
    queryKey: ["agent-update", serverId],
    queryFn: () => api.getAgentUpdateInfo(serverId),
    enabled: Boolean(serverId),
    refetchInterval: (query) => {
      const info = query.state.data;
      if (!info) return false;
      const last = info.lastUpdateJob;
      const waitingForReconnect = last?.status === "COMPLETED" && (!info.connected || info.currentVersion !== info.latestVersion);
      return info.activeUpdateJob || waitingForReconnect ? 5000 : false;
    },
  });

  // Server metrics for sparkline (uses cpu samples from observability)
  const { data: liveMetrics } = useQuery<{ cpu?: { samplesPercent?: number[] } } | undefined>({
    queryKey: ["server-cpu-samples", serverId],
    queryFn: async () => {
      const apiUrlBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrlBase}/metrics/${serverId}/current`, { credentials: "include" });
      if (!res.ok) return undefined;
      return res.json();
    },
    enabled: Boolean(serverId),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteServer(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      router.push("/servers");
    },
  });

  const liveApps = useMemo(() => apps.filter((app) => app.status === "running"), [apps]);
  const liveDatabases = useMemo(() => databases.filter((db) => db.status === "running"), [databases]);

  if (isLoading) {
    return (
      <>
        <Header title="Loading server" description="Fetching server state and resources." />
        <div className="dashboard-page">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      </>
    );
  }

  if (error || !server) {
    const errorMessage = error instanceof Error ? error.message : "This server could not be found.";
    return (
      <>
        <Header title="Unable to load server" description="Opslin could not load this server from the API." />
        <div className="dashboard-page">
          <Card className="mx-auto max-w-xl border-border">
            <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button asChild>
                <Link href="/servers">Back to servers</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const lastSeen = server.lastSeenAt ? formatRelativeTime(server.lastSeenAt) : "Never";
  const connectedAgo = server.connectedAt ? formatRelativeTime(server.connectedAt) : "Never";
  const isLive = server.isLiveConnected ?? server.status === "connected";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
  const displayAddress = server.publicIp || server.ip || server.hostname || "Unknown address";
  const updateLabel = agentUpdateLabel(agentUpdateInfo);
  const updateAvailable = Boolean(agentUpdateInfo?.updateAvailable || agentUpdateInfo?.activeUpdateJob);
  const cpuSeries = liveMetrics?.cpu?.samplesPercent ?? [];

  return (
    <div className="space-y-4 px-3 sm:px-6 py-5 max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/servers" className="hover:text-foreground">Servers</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{server.name}</span>
      </div>

      {/* Header card */}
      <Card className="border-border shadow-none">
        <CardContent className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5">
          <div className="flex items-center gap-3 min-w-0">
            <Server size={48} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground truncate">{server.name}</h1>
                <span className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border",
                  isLive
                    ? "text-success-text bg-success-muted border-success/30"
                    : "text-danger-text bg-danger-muted border-danger/30"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-success" : "bg-danger")} />
                  {isLive ? "Online" : "Offline"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {displayAddress} · {server.os || "Linux"} / {server.arch || "amd64"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/servers/${serverId}/security`}>
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Security
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/terminal?server=${serverId}`}>
                <Terminal className="mr-1.5 h-3.5 w-3.5" />
                Terminal
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Actions
            </Button>
            <Button
              size="sm"
              onClick={() => setAgentUpdateOpen(true)}
              disabled={Boolean(agentUpdateInfo && !agentUpdateInfo.connected && !agentUpdateInfo.manualUpdateRequired)}
              className={cn(
                updateAvailable
                  ? "bg-info hover:bg-info text-info-foreground"
                  : "bg-muted hover:bg-muted/70 text-foreground"
              )}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {updateLabel}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (confirm("Delete this server? This cannot be undone.")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AgentUpdateModal serverId={serverId} open={agentUpdateOpen} onOpenChange={setAgentUpdateOpen} />

      {/* Disconnected warning */}
      {!isLive && (
        <Alert className="border-danger/30 bg-danger-muted text-danger-text">
          <WifiOff className="h-4 w-4 text-danger-text" />
          <AlertTitle className="text-sm font-semibold">Agent disconnected</AlertTitle>
          <AlertDescription className="text-xs space-y-2">
            <p>This server is offline. Reconnect to restore monitoring and deploy controls.</p>
            <AgentInstallCommands apiUrl={apiUrl} dashboardUrl={dashboardUrl} compact showEndpoints={false} />
          </AlertDescription>
        </Alert>
      )}

      {/* Agent 2.0 Secure Control */}
      <SecureControlCard serverId={serverId} />

      {/* Status mini-cards row — this page's hero/summary surface (doc 03
          Group C); dark-mode-only ambient glow, one per page (doc 02 §3.5) */}
      <div className="glow-ambient grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatusMiniCard
          label="Connection"
          value={isLive ? "Live" : "Offline"}
          detail={`Last seen ${lastSeen}`}
          icon={<Activity className="h-3 w-3" />}
          iconBg="bg-info-muted"
          iconColor="text-info-text"
          chart={<Sparkline values={cpuSeries.length > 0 ? cpuSeries : [20, 25, 22, 30, 28, 32, 26, 24]} color="var(--opslin-info-default)" />}
        />
        <StatusMiniCard
          label="Runtime"
          value={`${apps.length} App${apps.length === 1 ? "" : "s"}`}
          detail={`${liveDatabases.length} databases running`}
          icon={<Box className="h-3 w-3" />}
          iconBg="bg-chart-violet/10"
          iconColor="text-chart-violet"
        />
        <StatusMiniCard
          label="Firewall"
          value={firewallState?.commits?.length ? `${firewallState.commits.length} commits` : "Unconfigured"}
          detail={firewallState?.cloudflare?.configured ? "Cloudflare linked" : "Local firewall only"}
          icon={<Shield className="h-3 w-3" />}
          iconBg="bg-warning-muted"
          iconColor="text-warning-text"
        />
        <StatusMiniCard
          label="System"
          value={`${server.os || "Linux"} / ${server.arch || "amd64"}`}
          detail={
            agentUpdateInfo
              ? `Agent v${server.agentVersion || "?"} · Latest v${agentUpdateInfo.latestVersion}`
              : `Agent v${server.agentVersion || "?"}`
          }
          icon={<HardDrive className="h-3 w-3" />}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
          badge={updateAvailable ? "Update" : undefined}
          badgeClass="text-info-text bg-info-muted border border-info/30"
        />
        <StatusMiniCard
          label="Domains"
          value={domainReadinessReady(server.domainReadiness) ? "Ready" : "Needs Check"}
          detail={`80 ${portStatusLabel(server.domainReadiness?.port80Status)} · 443 ${portStatusLabel(server.domainReadiness?.port443Status)}`}
          icon={<Globe className="h-3 w-3" />}
          iconBg="bg-success-muted"
          iconColor="text-success-text"
        />
      </div>

      {/* Custom domain firewall warning */}
      {server.domainReadiness?.warning ? (
        <Card className="border-info/30 bg-info-muted/40 shadow-none">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-2.5">
              <Info className="h-5 w-5 text-info-text flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Custom domain firewall requirement</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Open inbound TCP 80 and 443 in your cloud firewall/security group for custom domains and SSL.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-card">
              View Firewall Guide
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto -mx-2 px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto w-max min-w-full justify-start gap-6">
            {[
              { id: "overview", label: "Overview" },
              { id: "metrics", label: "Metrics" },
              { id: "resources", label: "Resources" },
              { id: "security", label: "Security" },
              { id: "history", label: "History" },
              { id: "settings", label: "Settings" },
            ].map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className={cn(
                  "rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2.5 whitespace-nowrap",
                  "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none",
                  "text-muted-foreground font-medium text-sm hover:text-foreground"
                )}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            {/* Left column */}
            <div className="space-y-4">
              {/* Applications */}
              <Card className="border-border shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">Applications</h2>
                      <p className="text-[11px] text-muted-foreground">Everything deployed on this host, with direct entry into each runtime surface.</p>
                    </div>
                    <Button asChild size="sm" className="bg-info hover:bg-info text-info-foreground">
                      <Link href={`/apps/new?server=${serverId}`}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Deploy App
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {apps.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/40/40 px-4 py-6 text-center">
                        <Package size={48} className="mx-auto" />
                        <p className="text-xs text-muted-foreground mt-2">No applications deployed yet.</p>
                      </div>
                    ) : (
                      apps.map((app) => (
                        <Link
                          key={app.id}
                          href={`/apps/${app.id}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-border hover:bg-muted/40 transition-colors"
                        >
                          <Package size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{app.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{app.domain || "No public domain"}</p>
                          </div>
                          <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border", appStatusBadge(app.status))}>
                            {app.status === "running" ? "Running" : app.status === "deleting" ? "Deleting" : app.status}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                        </Link>
                      ))
                    )}
                  </div>
                  {apps.length > 5 ? (
                    <Link href="/apps" className="text-[11px] font-semibold text-info-text hover:underline mt-3 inline-flex items-center gap-1">
                      View all applications
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : null}
                </CardContent>
              </Card>

              {/* Databases */}
              <Card className="border-border shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">Databases</h2>
                      <p className="text-[11px] text-muted-foreground">Database services running on this host, including backup and restore entry points.</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/databases/new?server=${serverId}`}>
                        <DatabaseIcon className="mr-1 h-3.5 w-3.5" />
                        Create Database
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {databases.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/40/40 px-4 py-6 text-center">
                        <DatabaseIcon size={48} className="mx-auto" />
                        <p className="text-xs text-muted-foreground mt-2 font-medium">No managed databases on this server yet.</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Create your first database to get started.</p>
                        <Button asChild size="sm" variant="outline" className="mt-2.5">
                          <Link href={`/databases/new?server=${serverId}`}>
                            Create Database
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      databases.map((db) => (
                        <Link
                          key={db.id}
                          href={`/databases/${db.id}?server=${serverId}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-border hover:bg-muted/40 transition-colors"
                        >
                          <DatabaseIcon size={36} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{db.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{db.type} · port {db.port || db.hostPort || "n/a"}</p>
                          </div>
                          <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border", dbStatusBadge(db.status))}>
                            {db.status}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                        </Link>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Security Posture */}
              <Card className="border-border shadow-none">
                <CardContent className="p-4">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold text-foreground">Security Posture</h2>
                    <p className="text-[11px] text-muted-foreground">Snapshot of firewall and Cloudflare integration state.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border px-3 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-warning-text text-base leading-none">🔥</span>
                        <span className="text-[11px] font-semibold text-foreground">Cloudflare</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {firewallState?.cloudflare?.configured ? "Connected" : "Not configured"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {firewallState?.cloudflare?.scopes?.length
                          ? `${firewallState.cloudflare.scopes.length} scopes`
                          : "No provider token saved for this server yet."}
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-[11px]">
                        <Link href={`/servers/${serverId}/security`}>Configure</Link>
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold text-foreground">Firewall Commits</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {firewallState?.commits?.length || 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {firewallState?.commits?.[0]?.status
                          ? `Latest: ${firewallState.commits[0].status}`
                          : "No firewall commit history on record yet."}
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-[11px]">
                        <Link href={`/servers/${serverId}/security`}>View Commits</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column: Server Facts + Security */}
            <div className="space-y-4">
              <Card className="border-border shadow-none">
                <CardContent className="p-4">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold text-foreground">Server Facts</h2>
                    <p className="text-[11px] text-muted-foreground">Identity, last-seen data, and agent state from the control plane.</p>
                  </div>
                  <div className="divide-y divide-border/60">
                    <FactRow icon={<Server className="h-3.5 w-3.5" />} label="Server ID" value={server.id.slice(0, 24)} copyable />
                    <FactRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Hostname" value={server.hostname || "Unknown"} copyable />
                    <FactRow icon={<Globe className="h-3.5 w-3.5" />} label="Public IP" value={server.publicIp || "Not reported"} copyable />
                    <FactRow icon={<Wifi className="h-3.5 w-3.5" />} label="Private IP" value={server.ip || "Unknown"} copyable />
                    <FactRow icon={<RefreshCw className="h-3.5 w-3.5" />} label="Agent Version" value={server.agentVersion || "Unknown"} />
                    <FactRow
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      label="Latest Agent"
                      value={agentUpdateInfo?.latestVersion || "Checking"}
                      badge={updateAvailable ? "Update Available" : undefined}
                      badgeClass="text-info-text bg-info-muted border-info/30"
                    />
                    <FactRow icon={<Activity className="h-3.5 w-3.5" />} label="Connected" value={connectedAgo} />
                    <FactRow icon={<Clock className="h-3.5 w-3.5" />} label="Last Seen" value={lastSeen} />
                    <FactRow icon={<Clock className="h-3.5 w-3.5" />} label="Uptime" value={fmtServerUptime(server.connectedAt)} />
                    <FactRow icon={<MonitorDot className="h-3.5 w-3.5" />} label="OS" value={server.os || "Unknown"} />
                    <FactRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Architecture" value={`${server.os || "Linux"} / ${server.arch || "amd64"}`} />
                  </div>
                </CardContent>
              </Card>

              <ServerDriftPanel serverId={serverId} className="border-border shadow-none" />

              {/* Keep your server secure */}
              <Card className="border-border shadow-none bg-info-muted/40">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Shield size={56} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-foreground">Keep your server secure</h3>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Enable firewall, set up backups, and keep your agent updated for best protection.
                      </p>
                      <Button asChild size="sm" className="mt-2.5 bg-info hover:bg-info text-info-foreground">
                        <Link href={`/servers/${serverId}/security`}>
                          Security Checklist
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Metrics tab */}
        <TabsContent value="metrics" className="mt-4">
          <ServerObservabilityPanel serverId={serverId} />
        </TabsContent>

        {/* Other tabs (placeholder, render existing content) */}
        <TabsContent value="resources" className="mt-4">
          <Card className="border-border shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Resource details for this server.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <Card className="border-border shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              <Link href={`/servers/${serverId}/security`} className="text-info-text hover:underline inline-flex items-center gap-1">
                Open Security page <ExternalLink className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <Card className="border-border shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Recent agent jobs and audit log entries will appear here.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <Card className="border-border shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Server name, tags, and danger-zone actions will appear here.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
