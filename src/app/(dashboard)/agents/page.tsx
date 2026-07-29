"use client";

/**
 * Agents page — clean table-based design matching the reference image.
 *
 * Layout:
 * - Header: Icon + "Agents" title + subtitle + menu button
 * - 5 stat cards: Total Agents, Online, Offline, Updating, Outdated
 * - Search bar + filters
 * - Agent table: Agent, Status, Heartbeat, Version, Uptime, Added, Actions
 * - Pagination footer
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, ChevronDown, Eye, Filter,
  MoreVertical, RefreshCw, Search, Zap, Server as ServerIcon, RotateCw, ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentUpdateModal } from "@/components/servers/agent-update-modal";
import { api, type Server } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getAgentStatus(server: Server): "online" | "offline" | "updating" {
  if (server.status === "pending") return "updating";
  if (server.isLiveConnected) return "online";
  return "offline";
}

// Highest agentVersion actually reported by any connected server — never a
// hardcoded product-version string. null when no server has reported one yet,
// in which case no server can be labeled "Latest".
function getLatestVersion(servers: Server[]): string | null {
  const versions = servers
    .map((s) => s.agentVersion)
    .filter((v): v is string => Boolean(v))
    .sort()
    .reverse();
  return versions[0] ?? null;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  dotColor,
  iconNode,
  label,
  value,
  subtitle,
}: {
  dotColor?: string;
  iconNode?: React.ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-start gap-3">
      {iconNode ? (
        <div className="flex-shrink-0 mt-0.5">{iconNode}</div>
      ) : dotColor ? (
        <span className={cn("h-3 w-3 rounded-full mt-1.5 flex-shrink-0", dotColor)} />
      ) : null}
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "online" | "offline" | "updating" }) {
  const config = {
    online: { label: "Online", dot: "bg-success", text: "text-success-text", bg: "bg-success-muted border-success/30" },
    offline: { label: "Offline", dot: "bg-danger", text: "text-danger-text", bg: "bg-danger-muted border-danger/30" },
    updating: { label: "Updating", dot: "bg-warning", text: "text-warning-text", bg: "bg-warning-muted border-warning/30" },
  };
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", c.bg, c.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [updateServerId, setUpdateServerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Fetch servers
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
    refetchInterval: 15000,
  });

  // Computed stats
  const stats = useMemo(() => {
    const total = servers.length;
    const online = servers.filter((s) => s.isLiveConnected).length;
    const offline = servers.filter((s) => !s.isLiveConnected && s.status !== "pending").length;
    const updating = servers.filter((s) => s.status === "pending").length;
    const outdated = servers.filter((s) => s.agentVersionWarning).length;
    return { total, online, offline, updating, outdated };
  }, [servers]);

  const latestVersion = useMemo(() => getLatestVersion(servers), [servers]);

  // Filtered & sorted servers
  const filteredServers = useMemo(() => {
    let list = [...servers];
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
    if (statusFilter === "offline") list = list.filter((s) => !s.isLiveConnected && s.status !== "pending");
    if (statusFilter === "updating") list = list.filter((s) => s.status === "pending");

    // Sort
    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "status") list.sort((a, b) => (b.isLiveConnected ? 1 : 0) - (a.isLiveConnected ? 1 : 0));
    else list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return list;
  }, [servers, searchQuery, statusFilter, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredServers.length / pageSize));
  const paginatedServers = filteredServers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <ServerIcon size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agents</h1>
            <p className="text-sm text-muted-foreground">Monitor and manage all your infrastructure agents.</p>
          </div>
        </div>
        <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          iconNode={<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-muted"><ServerIcon size={20} /></div>}
          label="Total Agents"
          value={stats.total}
          subtitle="All registered"
        />
        <StatCard
          dotColor="bg-success"
          label="Online"
          value={stats.online}
          subtitle={stats.total > 0 ? `${Math.round((stats.online / stats.total) * 100)}% of total` : "0% of total"}
        />
        <StatCard
          dotColor="bg-danger"
          label="Offline"
          value={stats.offline}
          subtitle={stats.total > 0 ? `${Math.round((stats.offline / stats.total) * 100)}% of total` : "0% of total"}
        />
        <StatCard
          iconNode={<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-muted"><RotateCw size={20} /></div>}
          label="Updating"
          value={stats.updating}
          subtitle={stats.total > 0 ? `${Math.round((stats.updating / stats.total) * 100)}% of total` : "0% of total"}
        />
        <StatCard
          iconNode={<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-muted"><ShieldAlert size={20} /></div>}
          label="Outdated"
          value={stats.outdated}
          subtitle={stats.outdated === 0 ? "Up to date" : `${stats.outdated} need update`}
        />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-[600px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="h-10 w-full pl-10 pr-4 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="h-10 px-3 pr-8 rounded-lg border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="updating">Updating</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
            className="h-10 px-3 pr-8 rounded-lg border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
          >
            <option value="recent">Sort: Recently Added</option>
            <option value="name">Sort: Name A-Z</option>
            <option value="status">Sort: Status</option>
          </select>
          <button className="h-10 w-10 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Agent Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <button className="inline-flex items-center gap-1 hover:text-foreground">
                    Agent
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Heartbeat</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Version</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Uptime</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Added</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {serversLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="px-5 py-5">
                        <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : paginatedServers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <ServerIcon size={48} className="mx-auto" />
                    <p className="mt-3 text-sm font-medium text-foreground">No agents found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {searchQuery || statusFilter !== "all"
                        ? "Try adjusting your filters"
                        : "Connect your first server to register an agent"}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedServers.map((server) => {
                  const status = getAgentStatus(server);
                  const isLatest = latestVersion !== null && server.agentVersion === latestVersion;
                  return (
                    <tr key={server.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/50 transition-colors">
                      {/* Agent */}
                      <td className="px-5 py-4">
                        <Link href={`/servers/${server.id}`} className="flex items-center gap-3 group">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                            <ServerIcon size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate group-hover:text-info transition-colors">
                              {server.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {server.publicIp || server.ip || "—"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={status} />
                      </td>
                      {/* Heartbeat */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <Zap className={cn("h-3.5 w-3.5", server.isLiveConnected ? "text-success-text" : "text-muted-foreground/50")} />
                          <span className="text-sm text-foreground">
                            {server.lastSeenAt ? formatRelativeTime(server.lastSeenAt) : "—"}
                          </span>
                        </div>
                      </td>
                      {/* Version */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground tabular-nums">
                            {server.agentVersion ? `v${server.agentVersion}` : "not reported"}
                          </span>
                          {isLatest && (
                            <span className="text-[10px] font-medium text-success-text bg-success-muted px-1.5 py-0.5 rounded">
                              Latest
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Uptime */}
                      <td className="px-5 py-4">
                        <span className="text-sm text-foreground tabular-nums">
                          {fmtUptime(server.connectedAt)}
                        </span>
                      </td>
                      {/* Added */}
                      <td className="px-5 py-4">
                        <span className="text-sm text-foreground">
                          {formatRelativeTime(server.createdAt)}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/servers/${server.id}`}>
                                <Eye className="h-4 w-4 mr-2" />View server
                              </Link>
                            </DropdownMenuItem>
                            {server.agentVersionWarning && (
                              <DropdownMenuItem onClick={() => setUpdateServerId(server.id)}>
                                <RefreshCw className="h-4 w-4 mr-2" />Update agent
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {filteredServers.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/60">
            <p className="text-sm text-muted-foreground">
              Showing {Math.min(filteredServers.length, (currentPage - 1) * pageSize + 1)}–{Math.min(filteredServers.length, currentPage * pageSize)} of {filteredServers.length} agents
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
                    page === currentPage
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-muted"
                  )}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Update modal */}
      {updateServerId && (
        <AgentUpdateModal
          serverId={updateServerId}
          open={Boolean(updateServerId)}
          onOpenChange={(open) => {
            if (!open) setUpdateServerId(null);
          }}
        />
      )}
    </div>
  );
}
