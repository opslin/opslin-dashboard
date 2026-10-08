"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, Container, FileText, HeartPulse, Info, MoreHorizontal, Rocket, RotateCw,
  Server, Sparkles, Terminal, Trash2, RefreshCw, Shield, WifiOff, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type App, type Database as DatabaseRecord } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { ServerDriftPanel } from "@/components/servers/server-drift-panel";
import { AgentInstallCommands } from "@/components/servers/agent-install-commands";
import { AgentUpdateModal } from "@/components/servers/agent-update-modal";
import { ServerCleanupModal } from "@/components/servers/server-cleanup-modal";
import { AppsDatabasesCard } from "@/components/servers/detail/apps-databases-card";
import { AgentCard, ServerDetailsCard } from "@/components/servers/detail/details-agent-cards";
import { formatUptime, type ServerCurrentMetrics } from "@/components/servers/detail/format";
import { AppsDatabasesTab } from "@/components/servers/detail/apps-databases-tab";
import { MetricsTab } from "@/components/servers/detail/metrics-tab";
import { SecurityTab } from "@/components/servers/detail/security-tab";
import { KpiCards } from "@/components/servers/detail/kpi-cards";
import { attentionIcons, NeedsAttention, type AttentionItem } from "@/components/servers/detail/needs-attention";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "apps", label: "Apps & Databases" },
  { id: "metrics", label: "Metrics" },
  { id: "security", label: "Security" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
] as const;

function fmtConnectedFor(connectedAt?: string | null) {
  if (!connectedAt) return "—";
  const seconds = (Date.now() - new Date(connectedAt).getTime()) / 1000;
  return formatUptime(seconds);
}

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
// Main page
// ---------------------------------------------------------------------------

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;
  const [agentUpdateOpen, setAgentUpdateOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [tab, setTab] = useState<string>("overview");

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

  const { data: metrics } = useQuery<ServerCurrentMetrics | undefined>({
    queryKey: ["server-current-metrics", serverId],
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
    onError: () => toast.error("Couldn't delete the server. Please try again."),
  });

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
  const updateAvailable = Boolean(agentUpdateInfo?.updateAvailable || agentUpdateInfo?.activeUpdateJob);
  const specs = [
    displayAddress,
    server.os || "Linux",
    metrics?.cpu?.cores ? `${metrics.cpu.cores} vCPU` : null,
    metrics?.memory?.total ? `${Math.round(metrics.memory.total / 1024 ** 3)} GB RAM` : null,
  ].filter(Boolean) as string[];

  const attention: AttentionItem[] = [];
  if (isLive && firewallState && !firewallState.commits?.length) {
    attention.push({ id: "firewall", icon: attentionIcons.shield, title: "Secure your server", description: "Firewall is not configured. Your server may be exposed.", actionLabel: "Set up", href: `/servers/${serverId}/security` });
  }
  if (server.domainReadiness?.warning) {
    attention.push({ id: "ports", icon: attentionIcons.ports, title: "Open ports 80 and 443", description: "Required for custom domains and HTTPS.", actionLabel: "How to open", onAction: () => setTab("security") });
  }
  if (isLive && updateAvailable && agentUpdateInfo) {
    attention.push({ id: "agent", icon: attentionIcons.update, title: "Update the Opslin agent", description: `v${server.agentVersion || "?"} → v${agentUpdateInfo.latestVersion} is available.`, actionLabel: "Update", onAction: () => setAgentUpdateOpen(true) });
  }

  return (
    <div className="dashboard-page space-y-4 pt-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/servers" className="hover:text-foreground">Servers</Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{server.name}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <Server className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">{server.name}</h1>
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", isLive ? "bg-success-muted text-success-text" : "bg-danger-muted text-danger-text")}>
                <span className={cn("size-2 rounded-full", isLive ? "bg-success" : "bg-danger")} aria-hidden="true" />
                {isLive ? "Online" : "Offline"}
              </span>
            </div>
            <p className="mt-1 text-[15px] text-muted-foreground">{specs.join("  ·  ")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="lg">
            <Link href={`/apps/new?server=${serverId}`}>
              <Rocket aria-hidden="true" /> Deploy app
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/terminal?server=${serverId}`}>
              <Terminal aria-hidden="true" /> Terminal
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="More server actions">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setAgentUpdateOpen(true)}>
                <RefreshCw aria-hidden="true" /> {updateAvailable ? "Update agent" : "Check agent updates"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCleanupOpen(true)}>
                <Sparkles aria-hidden="true" /> Clean &amp; secure
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/servers/${serverId}/security`}>
                  <Shield aria-hidden="true" /> Security settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger-text focus:text-danger-text"
                onSelect={() => {
                  if (confirm("Delete this server? This cannot be undone.")) deleteMutation.mutate();
                }}
              >
                <Trash2 aria-hidden="true" /> Delete server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AgentUpdateModal serverId={serverId} open={agentUpdateOpen} onOpenChange={setAgentUpdateOpen} />
      <ServerCleanupModal serverId={serverId} open={cleanupOpen} onOpenChange={setCleanupOpen} />

      {!isLive && (
        <Alert className="border-danger/30 bg-danger-muted text-danger-text">
          <WifiOff className="h-4 w-4 text-danger-text" />
          <AlertTitle className="text-sm font-semibold">{server.name} is offline</AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <p>Monitoring and deploys are paused. Run this command on the server to reconnect.</p>
            <AgentInstallCommands apiUrl={apiUrl} dashboardUrl={dashboardUrl} compact showEndpoints={false} />
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList variant="line" className="w-full justify-start gap-8 overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <KpiCards metrics={metrics} isLive={isLive} lastSeen={lastSeen} fallbackUptime={fmtConnectedFor(server.connectedAt)} />
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <NeedsAttention items={attention} />
              <AppsDatabasesCard serverId={serverId} apps={apps} databases={databases} limit={4} onViewAll={() => setTab("apps")} />
            </div>
            <div className="space-y-5">
              <ServerDetailsCard server={server} onEdit={() => setTab("settings")} />
              <AgentCard
                server={server}
                isLive={isLive}
                connectedAgo={connectedAgo}
                updateAvailable={updateAvailable}
                latestVersion={agentUpdateInfo?.latestVersion}
                onManage={() => setTab("settings")}
                onUpdate={() => setAgentUpdateOpen(true)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="apps">
          <AppsDatabasesTab serverId={serverId} apps={apps} databases={databases} />
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsTab serverId={serverId} />
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab serverId={serverId} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-5">
          <ServerDriftPanel serverId={serverId} className="border-border shadow-none" />
        </TabsContent>

        <TabsContent value="settings" className="space-y-5">
          <SecureControlCard serverId={serverId} />
          <Card className="rounded-2xl border-danger/30 shadow-none">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Delete server</h2>
                <p className="text-sm text-muted-foreground">Removes it from Opslin. Apps keep running on the machine but are no longer managed.</p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Delete this server? This cannot be undone.")) deleteMutation.mutate();
                }}
              >
                <Trash2 aria-hidden="true" /> Delete server
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
