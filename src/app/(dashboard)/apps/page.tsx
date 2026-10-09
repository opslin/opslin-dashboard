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
import { AlertTriangle, Box, Eye, ExternalLink, Layers, MoreVertical, Pause, Play, Rocket, Search, Trash2, Package } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NoServerPage } from "@/components/setup/setup-ui";
import { ExampleApps } from "@/components/setup/examples";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/patterns/stat-tile";
import { EmptyState } from "@/components/patterns/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { Header } from "@/components/layout/header";
import { PendingConfigDialog } from "@/components/apps/PendingConfigDialog";
import { DeployProgressDialog } from "@/components/apps/DeployProgressDialog";
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

// This dot is a branch/tier category (which branch this deploys from),
// not a health signal — deliberately neutral, not success/warning colors,
// so it never visually contradicts the real <StatusBadge> shown right below
// it (a Production-branch app can be actively failing; a green dot claiming
// otherwise right next to a red "Delete Failed" badge was genuinely
// misleading).
function envDotColor(_label: string): string {
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

// DIL Phase 22 — apps created by one multi-service AI-assisted deploy
// (runAutoDeployRepo) share a real deployGroup; shown as one "Project"
// card grouping its member apps instead of scattering them as unrelated
// entries. A worker's role is labeled explicitly here for the same reason
// the app detail page labels it — a background worker's preview link is
// expected to 404/502 (no HTTP port to serve), and looked exactly like a
// silent failure before this label existed.
function ProjectCard({ name, apps }: { name: string; apps: AppWithServer[] }) {
  // DIL Phase 23 — a service can deploy successfully and still be blocked on
  // a secret Opslin refused to guess. That's not a failure state any status
  // badge covers ("running" is literally true), so it needs its own signal or
  // the user has no way to know the deploy needs them.
  const [configApp, setConfigApp] = useState<AppWithServer | null>(null);
  const blockedCount = apps.filter((app) => (app.pendingConfig?.keys?.length ?? 0) > 0).length;
  // DIL Phase 25 — every unit created by the same runAutoDeployRepo call
  // shares one jobId; any member app that has one is enough to find it.
  const aiDeployApp = apps.find((app) => app.lastAutoDeployJobId);
  const [progressOpen, setProgressOpen] = useState(false);

  return (
    <div className="relative z-0 flex flex-col gap-3 rounded-lg border-2 border-brand/25 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted">
            <Layers size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="text-[11px] text-muted-foreground">{apps.length} service{apps.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {aiDeployApp && (
            <button
              type="button"
              onClick={() => setProgressOpen(true)}
              className="flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="View AI deploy progress"
              aria-label="View AI deploy progress"
            >
              <Eye size={14} />
            </button>
          )}
          {blockedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              <AlertTriangle size={11} />
              {blockedCount} need{blockedCount === 1 ? "s" : ""} setup
            </span>
          )}
          <span className="rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-semibold text-brand">Project</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {apps.map((app) => {
          const pendingKeys = app.pendingConfig?.keys?.length ?? 0;
          return (
            <div
              key={app.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60"
            >
              <Link href={`/apps/${app.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-xs font-medium text-foreground">{app.name}</span>
                {app.role && app.role !== "unknown" && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{app.role}</span>
                )}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5">
                {pendingKeys > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfigApp(app)}
                    className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
                    title={`${pendingKeys} required value${pendingKeys === 1 ? "" : "s"} missing — click to add`}
                  >
                    <AlertTriangle size={10} />
                    {pendingKeys} missing
                  </button>
                )}
                <StatusBadge status={app.effectiveStatus ?? app.status} />
              </span>
            </div>
          );
        })}
      </div>

      {configApp && (
        <PendingConfigDialog
          app={configApp}
          serverId={configApp.server.id}
          open={Boolean(configApp)}
          onOpenChange={(open) => { if (!open) setConfigApp(null); }}
        />
      )}
      {aiDeployApp?.lastAutoDeployJobId && (
        <DeployProgressDialog
          serverId={aiDeployApp.server.id}
          jobId={aiDeployApp.lastAutoDeployJobId}
          appLabel={name}
          open={progressOpen}
          onOpenChange={setProgressOpen}
        />
      )}
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
  // DIL Phase 23 — a standalone (non-project) app can be blocked on config
  // just as easily as one inside a project, so the same alert has to reach
  // these cards too. Held at page level because each card is a <Link> and
  // can't own a dialog of its own without nesting interactive elements.
  const [configApp, setConfigApp] = useState<AppWithServer | null>(null);
  // DIL Phase 25 — same page-level-state reason as configApp above: each
  // card is a <Link>, so the eye-icon dialog can't be nested inside it.
  const [progressApp, setProgressApp] = useState<AppWithServer | null>(null);

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  const { data: allApps = [], isLoading, isError, error, refetch } = useQuery({
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

  // DIL Phase 22 — split the filtered set into (project group -> its member
  // apps) and apps with no group at all, so the grid below can render one
  // ProjectCard per group instead of scattering its member apps as
  // unrelated entries. Filtering (search/status/server) is applied first
  // and each group only shows the members that survived it — a group with
  // every member filtered out simply doesn't render, same as any other app.
  const { groupedProjects, ungroupedApps } = useMemo(() => {
    const groups = new Map<string, { name: string; apps: AppWithServer[] }>();
    const ungrouped: AppWithServer[] = [];
    for (const app of filteredApps) {
      if (app.deployGroup) {
        const existing = groups.get(app.deployGroup.id);
        if (existing) existing.apps.push(app);
        else groups.set(app.deployGroup.id, { name: app.deployGroup.name, apps: [app] });
      } else {
        ungrouped.push(app);
      }
    }
    return {
      groupedProjects: Array.from(groups.entries()).map(([id, value]) => ({ id, ...value })),
      ungroupedApps: ungrouped,
    };
  }, [filteredApps]);

  // Stats
  const totalApps = allApps.length;
  const runningApps = allApps.filter((a) => a.status === "running").length;
  const stoppedApps = allApps.filter((a) => a.status === "stopped").length;
  const deletingApps = allApps.filter((a) => a.status === "deleting" || a.status === "delete_failed").length;

  if (!serversLoading && servers.length === 0) {
    return (
      <NoServerPage
        id="apps"
        title="Apps"
        subtitle="Manage and deploy your apps. Connect a server to see your own data."
        action={<Button><Rocket className="size-4" />Deploy new</Button>}
      >
        <ExampleApps />
      </NoServerPage>
    );
  }

  return (
    <>
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

      <div className="dashboard-page">
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
              <SelectTrigger size="sm" aria-label="Filter by server" className="w-[140px]">
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
              <SelectTrigger size="sm" aria-label="Filter by status" className="w-[140px]">
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
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Unable to load apps</AlertTitle>
            <AlertDescription>
              <p>{error instanceof Error ? error.message : "Something went wrong while loading your apps."}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
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
            {groupedProjects.map((project) => (
              <ProjectCard key={project.id} name={project.name} apps={project.apps} />
            ))}
            {ungroupedApps.map((app) => {
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
                    <div className="flex shrink-0 items-center gap-1">
                      {app.lastAutoDeployJobId && (
                        <button
                          type="button"
                          onClick={(event) => { event.preventDefault(); setProgressApp(app); }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          title="View AI deploy progress"
                          aria-label="View AI deploy progress"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => event.preventDefault()}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                        aria-label="More actions"
                      >
                        <MoreVertical className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={app.effectiveStatus ?? (app.status === "running" && !serverLive ? "offline" : app.status)} />
                    {(app.pendingConfig?.keys?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); setConfigApp(app); }}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
                        title={`${app.pendingConfig?.keys.length} required value(s) missing — click to add`}
                      >
                        <AlertTriangle size={10} />
                        {app.pendingConfig?.keys.length} missing
                      </button>
                    ) : !serverLive ? (
                      <span className="text-[11px] text-danger-text">Server offline</span>
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
                <h2 className="text-sm font-semibold text-foreground">Ready to deploy something amazing?</h2>
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

      {configApp && (
        <PendingConfigDialog
          app={configApp}
          serverId={configApp.server.id}
          open={Boolean(configApp)}
          onOpenChange={(open) => { if (!open) setConfigApp(null); }}
        />
      )}
      {progressApp?.lastAutoDeployJobId && (
        <DeployProgressDialog
          serverId={progressApp.server.id}
          jobId={progressApp.lastAutoDeployJobId}
          appLabel={progressApp.name}
          open={Boolean(progressApp)}
          onOpenChange={(open) => { if (!open) setProgressApp(null); }}
        />
      )}
      </div>
    </>
  );
}
