"use client";

/**
 * Servers page — redesigned to match the reference UI.
 *
 * Layout:
 * - Header: Icon + "Servers" title + subtitle
 * - Connect card: Linux VPS / Local Machine tabs, curl command, feature pills, server illustration
 * - Your Servers: count badge, search, status filter, sort
 * - Server cards: hostname, status, IP, OS, badges, metrics bars, action buttons
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy, Cpu, HardDrive, MoreVertical, Plus, Search, Server,
  Terminal as TerminalIcon, Wifi, Shield, Clock, FileText, Settings,
  Rocket, Monitor, Apple,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { api, type Server as ServerType } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)}MB`;
}

function fmtUptimeFromSeconds(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  const totalMin = Math.floor(seconds / 60);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function fmtUptime(connectedAt?: string | null): string {
  if (!connectedAt) return "—";
  const ms = Date.now() - new Date(connectedAt).getTime();
  if (ms < 0) return "—";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Server Card Component
// ---------------------------------------------------------------------------

function ServerCard({
  server,
  metrics,
  uptimeSec,
}: {
  server: ServerType;
  metrics?: {
    cpuPercent: number;
    memUsed: number;
    memTotal: number;
    diskUsed: number;
    diskTotal: number;
  };
  uptimeSec?: number;
}) {
  const isLive = server.isLiveConnected ?? server.status === "connected";
  const cpuPct = metrics?.cpuPercent ?? 0;
  const memUsed = metrics?.memUsed ?? 0;
  const memTotal = metrics?.memTotal ?? 0;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const diskUsed = metrics?.diskUsed ?? 0;
  const diskTotal = metrics?.diskTotal ?? 0;
  const diskPct = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

  const dockerReady = server.domainReadiness?.dockerReady ?? true;
  const agentConnected = isLive;

  return (
    <div className="hover-lift relative z-0 rounded-xl border border-border bg-card p-5">
      {/* Top row: server info + badges + menu */}
      <div className="flex items-start justify-between gap-4">
        <Link href={`/servers/${server.id}`} className="flex items-center gap-3 min-w-0 group">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted flex-shrink-0">
            <Server size={32} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-info transition-colors">
                {server.name}
              </h3>
              <span className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
                isLive
                  ? "text-success-text bg-success-muted border border-success/30"
                  : "text-danger-text bg-danger-muted border border-danger/30"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-success" : "bg-danger")} />
                {isLive ? "Online" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {server.publicIp || server.ip}
              {server.publicIp ? <span className="text-muted-foreground"> · Public IP</span> : null}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {server.os || "OS unknown"} · Agent {server.agentVersion || "not reported"}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status badges */}
          {agentConnected && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success-text bg-success-muted border border-success/30 px-2.5 py-1 rounded-full">
              <Wifi className="h-3 w-3" />
              Agent Connected
            </span>
          )}
          {dockerReady && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info-text bg-info-muted border border-info/30 px-2.5 py-1 rounded-full">
              <Monitor className="h-3 w-3" />
              Docker Ready
            </span>
          )}
          {/* Three-dot menu */}
          <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/60">
        {/* Uptime */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Uptime</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {uptimeSec ? fmtUptimeFromSeconds(uptimeSec) : fmtUptime(server.connectedAt)}
            </p>
          </div>
        </div>

        {/* CPU */}
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">CPU</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground tabular-nums">{cpuPct.toFixed(1)}%</p>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    cpuPct > 80 ? "bg-danger" : cpuPct > 50 ? "bg-warning" : "bg-success"
                  )}
                  style={{ width: `${Math.min(100, cpuPct)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Memory */}
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Memory</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {memTotal > 0 ? `${formatBytes(memUsed)} / ${formatBytes(memTotal)}` : "—"}
              </p>
              {memTotal > 0 && (
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      memPct > 80 ? "bg-danger" : memPct > 50 ? "bg-warning" : "bg-info"
                    )}
                    style={{ width: `${Math.min(100, memPct)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Disk */}
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Disk</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {diskTotal > 0 ? `${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}` : "—"}
              </p>
              {diskTotal > 0 && (
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      diskPct > 80 ? "bg-danger" : diskPct > 50 ? "bg-warning" : "bg-info"
                    )}
                    style={{ width: `${Math.min(100, diskPct)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/60">
        <Button asChild size="sm" className="h-8 text-xs">
          <Link href={`/apps/new?serverId=${server.id}`}>
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            Deploy App
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
          <Link href={`/terminal?serverId=${server.id}`}>
            <TerminalIcon className="h-3.5 w-3.5 mr-1.5" />
            Open Terminal
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
          <Link href={`/servers/${server.id}?tab=logs`}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            View Logs
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
          <Link href={`/servers/${server.id}?tab=settings`}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ServersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
    refetchInterval: 15000,
  });

  // Pick the first online server for metrics
  const primaryServer = useMemo(() => servers.find((s) => s.isLiveConnected) || servers[0], [servers]);

  // Fetch live metrics for the primary server
  const { data: primaryMetrics } = useQuery<{
    cpu?: { percent?: number; cores?: number };
    memory?: { used?: number; total?: number; percent?: number };
    disk?: { used?: number; total?: number; percent?: number };
    uptime?: number;
  }>({
    queryKey: ["server-metrics", primaryServer?.id],
    queryFn: async () => {
      if (!primaryServer) return {};
      const res = await fetch(`${API_URL}/metrics/${primaryServer.id}/current`, {
        credentials: "include",
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: Boolean(primaryServer),
    refetchInterval: 30000,
  });

  // Filtered servers
  const filteredServers = useMemo(() => {
    let list = servers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.ip || "").toLowerCase().includes(q) ||
        (s.publicIp || "").toLowerCase().includes(q) ||
        (s.hostname || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter === "online") list = list.filter((s) => s.isLiveConnected);
    if (statusFilter === "offline") list = list.filter((s) => !s.isLiveConnected);
    return list;
  }, [servers, searchQuery, statusFilter]);

  const linuxCommand = `curl -fsSL https://apis.hotops.sh/opslin/agent/install | sh`;
  const macCommand = `curl -fsSL ${API_URL}/agent/install/macos | bash`;

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    toast.success("Command copied to clipboard");
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-muted">
          <Server size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Servers</h1>
          <p className="text-sm text-muted-foreground">Manage and monitor your connected VPS instances</p>
        </div>
      </div>

      <StaggerGroup className="space-y-6">
      <StaggerItem>
      {/* Connect your server card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-stretch">
          {/* Left content */}
          <div className="flex-1 p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-muted">
                <TerminalIcon className="h-5 w-5 text-info-text" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Connect your server in one command</h2>
                <p className="text-sm text-muted-foreground">
                  Run the command below on your server to install the Opslin agent and establish a secure connection.
                </p>
              </div>
            </div>

            <Tabs defaultValue="linux" className="mt-4">
              <TabsList className="bg-muted h-9">
                <TabsTrigger value="linux" className="text-xs gap-1.5 px-3">
                  <Server className="h-3.5 w-3.5" />
                  Linux VPS
                </TabsTrigger>
                <TabsTrigger value="macos" className="text-xs gap-1.5 px-3">
                  <Apple className="h-3.5 w-3.5" />
                  Local Machine
                </TabsTrigger>
              </TabsList>

              <TabsContent value="linux" className="mt-3">
                <div className="flex items-center gap-2 rounded-lg bg-inverse px-4 py-3">
                  <code className="text-sm text-text-on-inverse-muted font-mono flex-1 truncate">
                    {linuxCommand}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => handleCopy(linuxCommand)}
                    className="h-7 text-xs flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="macos" className="mt-3">
                <div className="flex items-center gap-2 rounded-lg bg-inverse px-4 py-3">
                  <code className="text-sm text-text-on-inverse-muted font-mono flex-1 truncate">
                    {macCommand}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => handleCopy(macCommand)}
                    className="h-7 text-xs flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* Feature pills */}
            <div className="flex items-center gap-3 mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                SSH Required
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                Outbound 443
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                Secure Tunnel
              </span>
            </div>
          </div>

          {/* Right illustration */}
          <div className="hidden md:flex items-center justify-center w-[280px] bg-muted/40 p-6">
            <div className="relative">
              {/* Server rack illustration using stacked server icons — deliberately dark in both themes (bg-inverse), matching the always-dark sidebar/code-block treatment */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-32 h-10 rounded-lg bg-inverse border border-border-inverse flex items-center px-3 gap-1.5 shadow-lg">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <div className="flex-1" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                </div>
                <div className="w-32 h-10 rounded-lg bg-inverse-2 border border-border-inverse flex items-center px-3 gap-1.5 shadow-lg">
                  <div className="h-2 w-2 rounded-full bg-info animate-pulse" />
                  <div className="h-2 w-2 rounded-full bg-info" />
                  <div className="flex-1" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                </div>
                <div className="w-32 h-10 rounded-lg bg-inverse border border-border-inverse flex items-center px-3 gap-1.5 shadow-lg">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <div className="h-2 w-2 rounded-full bg-warning" />
                  <div className="flex-1" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                  <div className="h-1 w-4 bg-border-inverse rounded" />
                </div>
              </div>
              {/* Connection lines */}
              <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                <div className="h-px w-8 bg-border-inverse" />
                <div className="h-px w-6 bg-border-inverse" />
                <div className="h-px w-8 bg-border-inverse" />
              </div>
            </div>
          </div>
        </div>
      </div>
      </StaggerItem>

      <StaggerItem>
      {/* Your Servers section */}
      <div className="rounded-2xl border border-border bg-card">
        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Your Servers</h2>
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-xs font-semibold text-foreground tabular-nums">
              {servers.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 rounded-lg border border-border bg-muted/40 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 w-44"
              />
            </div>
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="recent">Sort: Recently Added</option>
              <option value="name">Sort: Name A-Z</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
        </div>

        {/* Server list */}
        <div className="p-4 space-y-3">
          {serversLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-40 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Server size={56} className="mx-auto" />
              <h3 className="mt-4 text-sm font-semibold text-foreground">No servers found</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Add your first server using the command above"}
              </p>
            </div>
          ) : (
            filteredServers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                metrics={
                  server.id === primaryServer?.id && primaryMetrics
                    ? {
                        cpuPercent: primaryMetrics.cpu?.percent ?? 0,
                        memUsed: primaryMetrics.memory?.used ?? 0,
                        memTotal: primaryMetrics.memory?.total ?? 0,
                        diskUsed: primaryMetrics.disk?.used ?? 0,
                        diskTotal: primaryMetrics.disk?.total ?? 0,
                      }
                    : undefined
                }
                uptimeSec={server.id === primaryServer?.id ? primaryMetrics?.uptime : undefined}
              />
            ))
          )}
        </div>
      </div>
      </StaggerItem>
      </StaggerGroup>
    </div>
  );
}
