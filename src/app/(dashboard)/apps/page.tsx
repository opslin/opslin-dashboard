"use client";

/**
 * Apps listing page.
 *
 * Performance optimizations (unchanged from before this redesign):
 * - Single `getAllApps()` call for the list (no per-app polling)
 * - Single `getAppsOverview()` call for CPU/RAM metrics (batched)
 * - 30s refetch interval for metrics (not per-second)
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, ExternalLink, MoreVertical, Pause, Play, Rocket, Search, Trash2, Package } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/patterns/stat-tile";
import { EmptyState } from "@/components/patterns/empty-state";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { Header } from "@/components/layout/header";
import { api, type AppWithServer, type Server } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isServerLive(server: Server | undefined) {
  if (!server) return false;
  if (typeof server.isLiveConnected === "boolean") return server.isLiveConnected;
  return server.status === "connected";
}

function formatMemory(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function envLabel(app: AppWithServer): string {
  if (app.branch === "main" || app.branch === "master") return "Production";
  if (app.branch === "staging" || app.branch === "develop") return "Staging";
  return "Production";
}

function envDotColor(label: string): string {
  if (label === "Production") return "bg-success";
  if (label === "Staging") return "bg-warning";
  return "bg-muted-foreground";
}

function resourceBarColor(percent: number) {
  if (percent > 80) return "bg-danger";
  if (percent > 50) return "bg-warning";
  return "bg-success";
}

// Mini progress bar for CPU/RAM
function ResourceBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 w-12 rounded-full bg-secondary overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", resourceBarColor(percent))}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AppsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serverFilter, setServerFilter] = useState<string>("all");

  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  const { data: allApps = [], isLoading } = useQuery({
    queryKey: ["all-apps"],
    queryFn: () => api.getAllApps(),
  });

  // Single batched metrics call — lightweight, 30s interval
  const { data: metricsOverview = [] } = useQuery({
    queryKey: ["apps-overview-metrics"],
    queryFn: () => api.getAppsOverview(),
    refetchInterval: 30_000,
  });

  // Build metrics lookup map (O(1) per app)
  const metricsMap = useMemo(() => {
    const map = new Map<string, { cpu: number; ram: number; ramLabel: string }>();
    for (const m of metricsOverview) {
      map.set(m.id, {
        cpu: Math.round(m.cpuPercent || 0),
        ram: Math.round(m.memoryPercent || 0),
        ramLabel: formatMemory(m.memoryUsed || 0),
      });
    }
    return map;
  }, [metricsOverview]);

  // Filtered apps
  const filteredApps = useMemo(() => {
    let apps = allApps;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      apps = apps.filter((a) => a.name.toLowerCase().includes(q) || a.server.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      apps = apps.filter((a) => a.status === statusFilter);
    }
    if (serverFilter !== "all") {
      apps = apps.filter((a) => a.server.id === serverFilter);
    }
    return apps;
  }, [allApps, searchQuery, statusFilter, serverFilter]);

  // Stats
  const totalApps = allApps.length;
  const runningApps = allApps.filter((a) => a.status === "running").length;
  const stoppedApps = allApps.filter((a) => a.status === "stopped").length;
  const deletingApps = allApps.filter((a) => a.status === "deleting" || a.status === "delete_failed").length;

  return (
    <div className="dashboard-page">
      <Header
        title="Apps"
        description="Deploy and manage your applications across all servers."
        actions={
          <Button asChild>
            <Link href="/apps/new">
              <Rocket className="size-4" />
              Deploy app
            </Link>
          </Button>
        }
      />

      <StaggerGroup className="flex flex-col gap-5">
        <StaggerItem className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total apps" value={totalApps} icon={Box} />
          <StatTile
            label="Running"
            value={runningApps}
            icon={Play}
            delta={{ label: totalApps > 0 ? `${((runningApps / totalApps) * 100).toFixed(0)}% of total` : "no apps yet", direction: "neutral" }}
          />
          <StatTile label="Stopped" value={stoppedApps} icon={Pause} />
          <StatTile
            label="Deleting"
            value={deletingApps}
            icon={Trash2}
            delta={deletingApps > 0 ? { label: "in progress", direction: "down" } : undefined}
          />
        </StaggerItem>

        <StaggerItem className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={serverFilter} onValueChange={setServerFilter}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="All servers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All servers</SelectItem>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="deploying">Deploying</SelectItem>
                <SelectItem value="deleting">Deleting</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </StaggerItem>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title={searchQuery || statusFilter !== "all" || serverFilter !== "all" ? "No apps match your filters" : "Deploy your first app"}
            description={
              searchQuery || statusFilter !== "all" || serverFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Connect a repository and get a production-ready app running on your server in minutes."
            }
            action={
              !searchQuery && statusFilter === "all" && serverFilter === "all" ? (
                <Button asChild>
                  <Link href="/apps/new">Deploy app</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <StaggerItem className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredApps.map((app) => {
              const metrics = metricsMap.get(app.id);
              const env = envLabel(app);
              const url = app.domain || app.primaryDomain || app.preferredUrl;
              const serverLive = isServerLive(app.server as unknown as Server);

              return (
                <Link
                  key={app.id}
                  href={`/apps/${app.id}`}
                  className="hover-lift group relative z-0 flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted">
                        <Package size={24} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{app.name}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", envDotColor(env))} />
                          {env}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => event.preventDefault()}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                      aria-label="More actions"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <StatusBadge status={app.status} />
                    {!serverLive ? (
                      <span className="text-[11px] text-muted-foreground">Server offline</span>
                    ) : null}
                  </div>

                  {url ? (
                    <span className="flex items-center gap-1 truncate text-xs text-info-text">
                      {url.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No domain configured</span>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-4 border-t border-border/70 pt-3">
                    {metrics ? (
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] font-medium uppercase text-muted-foreground">CPU</p>
                          <p className="text-xs font-semibold tabular-nums text-foreground">{metrics.cpu}%</p>
                          <ResourceBar percent={metrics.cpu} />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase text-muted-foreground">RAM</p>
                          <p className="text-xs font-semibold tabular-nums text-foreground">{metrics.ramLabel}</p>
                          <ResourceBar percent={metrics.ram} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{app.server.name}</span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(app.deployedAt || app.createdAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </StaggerItem>
        )}

        {filteredApps.length > 0 ? (
          <StaggerItem className="flex flex-col gap-4 rounded-lg border border-border/80 bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Rocket size={40} />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ready to deploy something amazing?</h3>
                <p className="text-xs text-muted-foreground">Connect your repository and deploy in minutes.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/docs">
                  <Box className="size-3.5" />
                  Documentation
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/apps/new">
                  <Rocket className="size-3.5" />
                  Deploy another app
                </Link>
              </Button>
            </div>
          </StaggerItem>
        ) : null}
      </StaggerGroup>
    </div>
  );
}
