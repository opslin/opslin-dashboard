"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Server, Terminal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type App, type Database as DatabaseRecord } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { ServerDriftPanel } from "@/components/servers/server-drift-panel";
import { AgentUpdateModal } from "@/components/servers/agent-update-modal";
import { ServerCleanupModal } from "@/components/servers/server-cleanup-modal";
import { AppsCard, DatabasesCard, DetailsCard, RecentActivityCard } from "@/components/servers/detail/overview-lists";
import { formatUptime, type ServerCurrentMetrics } from "@/components/servers/detail/format";
import { AppsDatabasesTab } from "@/components/servers/detail/apps-databases-tab";
import { MetricsTab } from "@/components/servers/detail/metrics-tab";
import { SecurityTab } from "@/components/servers/detail/security-tab";
import { ServerActionsMenu } from "@/components/servers/detail/server-actions-menu";
import { ActivityTab } from "@/components/servers/detail/activity-tab";
import { SettingsTab } from "@/components/servers/detail/settings-tab";
import { OfflineOverview } from "@/components/servers/detail/offline-overview";
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
  const isLive = server.isLiveConnected ?? server.status === "connected";
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
            <p className="mt-1 text-[15px] text-muted-foreground">{(isLive ? specs : [displayAddress, server.os || "Linux", `Last seen ${lastSeen}`]).join("  ·  ")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <>
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
            </>
          ) : (
            <>
              <Button size="lg" disabled title="Server is offline"><Rocket aria-hidden="true" /> Deploy app</Button>
              <Button variant="outline" size="lg" disabled title="Server is offline"><Terminal aria-hidden="true" /> Terminal</Button>
            </>
          )}
          <ServerActionsMenu
            serverId={serverId}
            serverName={server.name}
            updateVersion={updateAvailable ? agentUpdateInfo?.latestVersion : null}
            onUpdate={() => setAgentUpdateOpen(true)}
            onClean={() => setCleanupOpen(true)}
            onDelete={() => {
              if (confirm("Delete this server? This cannot be undone.")) deleteMutation.mutate();
            }}
          />
        </div>
      </div>

      <AgentUpdateModal serverId={serverId} open={agentUpdateOpen} onOpenChange={setAgentUpdateOpen} />
      <ServerCleanupModal serverId={serverId} serverName={server.name} open={cleanupOpen} onOpenChange={setCleanupOpen} />


      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList variant="line" className="w-full justify-start gap-8 overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          {!isLive ? (
            <OfflineOverview server={server} apps={apps} />
          ) : (
          <>
          <KpiCards metrics={metrics} isLive={isLive} lastSeen={lastSeen} fallbackUptime={fmtConnectedFor(server.connectedAt)} />
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <NeedsAttention items={attention} />
              <AppsCard serverId={serverId} apps={apps} />
              <DatabasesCard serverId={serverId} databases={databases} />
            </div>
            <div className="space-y-5">
              <DetailsCard server={server} updateAvailable={updateAvailable} onUpdate={() => setAgentUpdateOpen(true)} />
              <RecentActivityCard
                server={server}
                apps={apps}
                firewallCommits={firewallState?.commits ?? []}
                agentUpdatedAt={agentUpdateInfo?.lastUpdateJob?.status === "COMPLETED" ? agentUpdateInfo.lastUpdateJob.endedAt ?? null : null}
                onViewAll={() => setTab("activity")}
              />
            </div>
          </div>
          </>
          )}
        </TabsContent>

        <TabsContent value="apps">
          <AppsDatabasesTab serverId={serverId} apps={apps} databases={databases} />
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsTab serverId={serverId} />
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-5">
            <SecurityTab serverId={serverId} />
            <ServerDriftPanel serverId={serverId} className="border-border shadow-none" />
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab serverId={serverId} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab
            server={server}
            isLive={isLive}
            updateVersion={updateAvailable ? agentUpdateInfo?.latestVersion : null}
            onUpdate={() => setAgentUpdateOpen(true)}
            onDelete={() => {
              if (confirm("Delete this server? This cannot be undone.")) deleteMutation.mutate();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
