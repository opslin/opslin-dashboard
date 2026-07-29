"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Loader2, AlertTriangle, Search, Filter, MoreVertical, Copy, ChevronLeft, ChevronRight, Trash2, StopCircle, PlayCircle, Settings, WifiOff, ExternalLink, BookOpen, Database, CheckCircle2, Rocket, DatabaseBackup, Server, Lock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { usePlan } from "@/hooks/usePlan";
import { api, Database as DbType } from "@/lib/api";
import { DatabaseBrandIcon } from "@/components/database/database-brand-icon";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const PAGE_SIZE = 8;

const DB_ICONS: Record<string, { engine: string; label: string }> = {
    postgresql: { engine: "postgresql", label: "PostgreSQL" },
    mysql: { engine: "mysql", label: "MySQL" },
    mongodb: { engine: "mongodb", label: "MongoDB" },
    redis: { engine: "redis", label: "Redis" },
};

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string }> = {
    creating: { label: "Creating", dotColor: "bg-warning", textColor: "text-warning-text" },
    pending: { label: "Pending", dotColor: "bg-warning", textColor: "text-warning-text" },
    running: { label: "Running", dotColor: "bg-success", textColor: "text-success-text" },
    stopped: { label: "Stopped", dotColor: "bg-muted-foreground/50", textColor: "text-muted-foreground" },
    stopping: { label: "Stopping", dotColor: "bg-warning", textColor: "text-warning-text" },
    error: { label: "Error", dotColor: "bg-danger", textColor: "text-danger-text" },
};

export default function DatabasesPage() {
    const queryClient = useQueryClient();
    const [deleteConfirm, setDeleteConfirm] = useState<{ db: DbType; serverId: string } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [engineFilter, setEngineFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [accessFilter, setAccessFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const { isAtLimit } = usePlan();
    const databaseLimitReached = isAtLimit("database");

    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
    });

    const { data: allDatabases = [], isLoading, refetch } = useQuery({
        queryKey: ["allDatabases", servers.map(s => s.id)],
        queryFn: async () => {
            const results: { db: DbType; serverId: string; serverName: string }[] = [];
            for (const server of servers) {
                try {
                    const dbs = await api.getDatabases(server.id);
                    dbs.forEach(db => results.push({ db, serverId: server.id, serverName: server.name }));
                } catch { /* Server might not be connected */ }
            }
            return results;
        },
        enabled: servers.length > 0,
    });

    // Mutations
    const deleteMutation = useMutation({
        mutationFn: async ({ serverId, dbId }: { serverId: string; dbId: string }) => {
            setDeletingId(dbId);
            const response = await fetch(`${API_URL}/servers/${serverId}/databases/${dbId}`, { method: "DELETE", credentials: "include" });
            if (!response.ok) { const error = await response.json().catch(() => ({ message: "Failed" })); throw new Error(error.message); }
            return response.json();
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["allDatabases"] }); setDeleteConfirm(null); setDeletingId(null); },
        onError: () => { setDeletingId(null); },
    });

    const [stoppingId, setStoppingId] = useState<string | null>(null);
    const stopMutation = useMutation({
        mutationFn: async ({ serverId, dbId }: { serverId: string; dbId: string }) => {
            setStoppingId(dbId);
            const response = await fetch(`${API_URL}/servers/${serverId}/databases/${dbId}/stop`, { method: "POST", credentials: "include" });
            if (!response.ok) throw new Error("Failed to stop");
            return response.json();
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["allDatabases"] }); setStoppingId(null); },
        onError: () => { setStoppingId(null); },
    });

    const [startingId, setStartingId] = useState<string | null>(null);
    const startMutation = useMutation({
        mutationFn: async ({ serverId, dbId }: { serverId: string; dbId: string }) => {
            setStartingId(dbId);
            const response = await fetch(`${API_URL}/servers/${serverId}/databases/${dbId}/start`, { method: "POST", credentials: "include" });
            if (!response.ok) throw new Error("Failed to start");
            return response.json();
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["allDatabases"] }); setStartingId(null); },
        onError: () => { setStartingId(null); },
    });

    // Filtered data
    const filteredDatabases = useMemo(() => {
        return allDatabases.filter(({ db }) => {
            if (searchQuery && !db.name.toLowerCase().includes(searchQuery.toLowerCase()) && !db.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (engineFilter !== "all" && db.type.toLowerCase() !== engineFilter) return false;
            if (statusFilter !== "all" && db.status.toLowerCase() !== statusFilter) return false;
            if (accessFilter !== "all") {
                if (accessFilter === "read-only" && !db.readOnly) return false;
                if (accessFilter === "read-write" && db.readOnly) return false;
                if (accessFilter === "internal" && db.exposure !== "internal") return false;
                if (accessFilter === "public" && db.exposure !== "public") return false;
            }
            return true;
        });
    }, [allDatabases, searchQuery, engineFilter, statusFilter, accessFilter]);

    const totalPages = Math.ceil(filteredDatabases.length / PAGE_SIZE);
    const paginatedDatabases = filteredDatabases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Stats
    const totalCount = allDatabases.length;
    const runningCount = allDatabases.filter(d => d.db.status.toLowerCase() === "running").length;
    const pgCount = allDatabases.filter(d => d.db.type.toLowerCase() === "postgresql").length;
    const mysqlCount = allDatabases.filter(d => d.db.type.toLowerCase() === "mysql").length;
    const mongoCount = allDatabases.filter(d => d.db.type.toLowerCase() === "mongodb").length;
    const redisCount = allDatabases.filter(d => d.db.type.toLowerCase() === "redis").length;

    const hasDatabases = allDatabases.length > 0;

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Database size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Databases</h1>
                        <p className="text-sm text-muted-foreground">{hasDatabases ? "Manage all your database instances in one place." : "Deploy, manage, and scale your database instances with ease."}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasDatabases && (
                        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5 border-border/60 bg-card text-xs">
                            <RefreshCw className="h-3.5 w-3.5" /> Refresh
                        </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 bg-card text-xs">
                        <BookOpen className="h-3.5 w-3.5" /> Documentation
                    </Button>
                    {databaseLimitReached ? (
                        <UpgradePrompt feature="databases" compact />
                    ) : (
                        <Button size="sm" className="h-8 gap-1.5 bg-info hover:bg-info/90 text-info-foreground text-xs" asChild>
                            <Link href="/databases/new"><Plus className="h-3.5 w-3.5" /> Create Database</Link>
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <Database size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{totalCount}</div>
                        <div className="text-[11px] text-muted-foreground">Total Databases</div>
                    </div>
                </div>
                {hasDatabases && (
                    <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                        <CheckCircle2 size={28} />
                        <div>
                            <div className="text-2xl font-mono font-bold text-success-text">{runningCount}</div>
                            <div className="text-[11px] text-muted-foreground">Running</div>
                        </div>
                    </div>
                )}
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <Database size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{pgCount}</div>
                        <div className="text-[11px] text-muted-foreground">PostgreSQL</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <Database size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{mysqlCount}</div>
                        <div className="text-[11px] text-muted-foreground">MySQL</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <Database size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{mongoCount}</div>
                        <div className="text-[11px] text-muted-foreground">MongoDB</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <Database size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{redisCount}</div>
                        <div className="text-[11px] text-muted-foreground">Redis</div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="mt-4 text-sm text-muted-foreground">Loading databases...</p>
                </div>
            ) : !hasDatabases ? (
                /* Empty State */
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left: Empty illustration */}
                    <div className="lg:col-span-3 rounded-xl border border-border/60 bg-card p-12 text-center flex flex-col items-center justify-center">
                        <Database size={80} className="mb-4 opacity-60" />
                        <h2 className="text-xl font-semibold text-foreground">No databases yet</h2>
                        <p className="mt-2 text-sm text-muted-foreground max-w-md">Get started by deploying your first database instance. Support for PostgreSQL, MySQL, MongoDB, and Redis.</p>
                        {databaseLimitReached ? (
                            <div className="mt-6"><UpgradePrompt feature="databases" /></div>
                        ) : (
                            <Button className="mt-6 h-10 px-6 bg-info hover:bg-info/90 text-info-foreground" asChild>
                                <Link href="/databases/new"><Plus className="h-4 w-4 mr-2" /> Create Your First Database</Link>
                            </Button>
                        )}
                        <a href="#" className="mt-3 text-xs text-info-text hover:text-info font-medium flex items-center gap-1">
                            Explore Documentation <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                    {/* Right: Quick Start */}
                    <div className="lg:col-span-2 rounded-xl border border-border/60 bg-card p-6">
                        <h3 className="text-base font-semibold text-foreground mb-1">Quick Start</h3>
                        <p className="text-xs text-muted-foreground mb-4">Choose your database engine and deploy in seconds.</p>
                        <div className="space-y-2">
                            {[
                                { id: "postgresql", name: "PostgreSQL", desc: "Open source, powerful, and reliable." },
                                { id: "mysql", name: "MySQL", desc: "Fast, reliable, and widely used." },
                                { id: "mongodb", name: "MongoDB", desc: "Flexible document database." },
                                { id: "redis", name: "Redis", desc: "In-memory data structure store." },
                            ].map(db => (
                                <Link key={db.id} href="/databases/new" className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:bg-muted/30 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <DatabaseBrandIcon engine={db.id} size={28} />
                                        <div>
                                            <div className="text-sm font-medium text-foreground">{db.name}</div>
                                            <div className="text-[11px] text-muted-foreground">{db.desc}</div>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                /* Database Table */
                <>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search databases by name, ID, or host..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="pl-9 h-9 border-border/60 bg-card"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={engineFilter} onValueChange={(v) => { setEngineFilter(v); setCurrentPage(1); }}>
                                <SelectTrigger className="h-9 w-32 border-border/60 bg-card text-xs"><SelectValue placeholder="All Engines" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Engines</SelectItem>
                                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                                    <SelectItem value="mysql">MySQL</SelectItem>
                                    <SelectItem value="mongodb">MongoDB</SelectItem>
                                    <SelectItem value="redis">Redis</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                                <SelectTrigger className="h-9 w-28 border-border/60 bg-card text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="running">Running</SelectItem>
                                    <SelectItem value="stopped">Stopped</SelectItem>
                                    <SelectItem value="creating">Creating</SelectItem>
                                    <SelectItem value="error">Error</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={accessFilter} onValueChange={(v) => { setAccessFilter(v); setCurrentPage(1); }}>
                                <SelectTrigger className="h-9 w-28 border-border/60 bg-card text-xs"><SelectValue placeholder="All Access" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Access</SelectItem>
                                    <SelectItem value="read-only">Read-only</SelectItem>
                                    <SelectItem value="read-write">Read-write</SelectItem>
                                    <SelectItem value="internal">Internal</SelectItem>
                                    <SelectItem value="public">Public</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border/60 bg-card text-xs">
                                <Filter className="h-3.5 w-3.5" /> Filters
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/60 bg-muted/30">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Database</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Engine</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Host</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Port</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Access</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedDatabases.map(({ db, serverId, serverName }) => {
                                        const dbConfig = DB_ICONS[db.type.toLowerCase()] || DB_ICONS.postgresql;
                                        const statusConfig = STATUS_CONFIG[db.status.toLowerCase()] || STATUS_CONFIG.error;
                                        const serverData = servers.find(s => s.id === serverId);
                                        const isServerLive = serverData?.isLiveConnected === true;
                                        const host = serverData?.publicIp || serverData?.ip || "—";
                                        const createdAgo = (() => {
                                            const diff = Date.now() - new Date(db.createdAt).getTime();
                                            const hours = Math.floor(diff / 3600000);
                                            const days = Math.floor(diff / 86400000);
                                            if (days > 0) return `${days}d ago`;
                                            return `${hours}h ago`;
                                        })();

                                        return (
                                            <tr key={db.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors group">
                                                <td className="py-3 px-4">
                                                    <Link href={`/databases/${db.id}?server=${serverId}`} className="flex items-center gap-3 group/link">
                                                        <DatabaseBrandIcon engine={dbConfig.engine} size={24} />
                                                        <div>
                                                            <div className="font-medium text-foreground group-hover/link:text-info transition-colors">{db.name}</div>
                                                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                                                                db_{db.id.slice(0, 12)} <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 cursor-pointer" />
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </td>
                                                <td className="py-3 px-4 text-muted-foreground">
                                                    {dbConfig.label}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusConfig.textColor}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor}`} />
                                                        {statusConfig.label}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{host}</td>
                                                <td className="py-3 px-4 font-mono text-xs text-foreground">{db.hostPort || "—"}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">{db.readOnly ? "Read-only" : "Read-write"}</span>
                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{db.exposure || "Internal"}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-muted-foreground">{createdAgo}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/databases/${db.id}?server=${serverId}`}><Settings className="h-4 w-4 mr-2" />Manage</Link>
                                                            </DropdownMenuItem>
                                                            {db.status.toLowerCase() === "running" ? (
                                                                <DropdownMenuItem disabled={stoppingId === db.id || !isServerLive} onClick={() => isServerLive && stopMutation.mutate({ serverId, dbId: db.id })}>
                                                                    {stoppingId === db.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <StopCircle className="h-4 w-4 mr-2" />}
                                                                    {!isServerLive ? "Agent Offline" : stoppingId === db.id ? "Stopping..." : "Stop"}
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem disabled={startingId === db.id || !isServerLive} onClick={() => isServerLive && startMutation.mutate({ serverId, dbId: db.id })}>
                                                                    {startingId === db.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                                                                    {!isServerLive ? "Agent Offline" : startingId === db.id ? "Starting..." : "Start"}
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-danger-text focus:text-danger" onClick={() => setDeleteConfirm({ db, serverId })}>
                                                                <Trash2 className="h-4 w-4 mr-2" />Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
                            <span className="text-xs text-muted-foreground">
                                Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filteredDatabases.length)} of {filteredDatabases.length} databases
                            </span>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map(p => (
                                    <Button key={p} variant={currentPage === p ? "default" : "outline"} size="sm" className={`h-7 w-7 p-0 text-xs ${currentPage === p ? "bg-info text-info-foreground" : ""}`} onClick={() => setCurrentPage(p)}>
                                        {p}
                                    </Button>
                                ))}
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Why databases section (empty state only) */}
            {!hasDatabases && !isLoading && (
                <div className="rounded-xl border border-border/60 bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Why databases on Opslin?</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        {[
                            { icon: Rocket, title: "One-click Deploy", desc: "Spin up databases in seconds" },
                            { icon: DatabaseBackup, title: "Automated Backups", desc: "Daily backups and point-in-time recovery" },
                            { icon: Server, title: "High Availability", desc: "Built-in redundancy and failover" },
                            { icon: Lock, title: "Secure by Default", desc: "Encrypted and isolated networks" },
                            { icon: TrendingUp, title: "Scalable", desc: "Scale vertically or horizontally" },
                        ].map(item => (
                            <div key={item.title} className="flex items-start gap-2">
                                <item.icon size={24} />
                                <div>
                                    <div className="text-xs font-medium text-foreground">{item.title}</div>
                                    <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Delete Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-muted">
                                <AlertTriangle className="h-5 w-5 text-danger-text" />
                            </div>
                            <AlertDialogTitle>Delete Database?</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription>
                            This will permanently delete <strong>{deleteConfirm?.db.name}</strong> and all its data. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteConfirm && deleteMutation.mutate({ serverId: deleteConfirm.serverId, dbId: deleteConfirm.db.id })}
                            disabled={deleteMutation.isPending}
                            className="bg-danger hover:bg-danger/90"
                        >
                            {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : <><Trash2 className="h-4 w-4 mr-2" />Delete</>}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
