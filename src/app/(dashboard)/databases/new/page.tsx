"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Zap, Check, AlertCircle, ChevronRight, Database, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { DatabaseBrandIcon } from "@/components/database/database-brand-icon";
import { usePlan } from "@/hooks/usePlan";
import { api, type DatabaseEngineConfig } from "@/lib/api";

// Phase 5 (Bakaloo-benchmark hardening plan) — same presets for every plan
// tier (confirmed founder decision), matching the server-side bounds
// exactly (opslin-api/src/lib/databases-service.ts).
const RESOURCE_TIERS = [
    { label: "Small — 0.5 CPU / 256MB", cpuLimit: 0.5, memoryLimit: 256 },
    { label: "Medium — 1 CPU / 512MB", cpuLimit: 1, memoryLimit: 512 },
    { label: "Large — 2 CPU / 1024MB", cpuLimit: 2, memoryLimit: 1024 },
    { label: "XL — 4 CPU / 2048MB", cpuLimit: 4, memoryLimit: 2048 },
    { label: "2XL — 4 CPU / 4096MB", cpuLimit: 4, memoryLimit: 4096 },
] as const;
const DEFAULT_RESOURCE_TIER_INDEX = 1;

const REDIS_MAXMEMORY_POLICIES = [
    "noeviction", "allkeys-lru", "volatile-lru", "allkeys-lfu",
    "volatile-lfu", "allkeys-random", "volatile-random", "volatile-ttl",
] as const;

const DB_TYPES = [
    { id: "postgresql", name: "PostgreSQL", description: "Powerful, open source SQL database", defaultName: "postgres", features: ["ACID", "JSON", "Full-text search"] },
    { id: "mysql", name: "MySQL", description: "Fast, reliable relational database", defaultName: "mysql", features: ["InnoDB", "Replication", "Fast reads"] },
    { id: "mongodb", name: "MongoDB", description: "Flexible document database", defaultName: "mongo", features: ["Documents", "Aggregation", "Sharding"] },
    { id: "redis", name: "Redis", description: "In-memory cache and data store", defaultName: "redis", features: ["Caching", "Pub/Sub", "Sessions"] },
];

interface DatabaseToCreate {
    type: string;
    name: string;
    exposure: "internal" | "public";
    status: "pending" | "creating" | "success" | "error";
    error?: string;
    createdId?: string;
    resourceTierIndex: number;
    engineConfig: DatabaseEngineConfig;
    showAdvanced: boolean;
}

function newDatabaseToCreate(type: string, name: string): DatabaseToCreate {
    return {
        type,
        name,
        exposure: "internal",
        status: "pending",
        resourceTierIndex: DEFAULT_RESOURCE_TIER_INDEX,
        engineConfig: {},
        showAdvanced: false,
    };
}

export default function NewDatabasePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [serverId, setServerId] = useState("");
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [databasesToCreate, setDatabasesToCreate] = useState<DatabaseToCreate[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const { plan, usage, loading: planLoading, isAtLimit } = usePlan();
    const remainingDatabases = plan?.maxDatabases === -1 ? Infinity : Math.max(0, (plan?.maxDatabases ?? 0) - (usage?.databases ?? 0));
    const databaseLimitReached = !planLoading && isAtLimit("database");

    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
    });

    const connectedServers = servers.filter(s => s.status.toLowerCase() === "connected");

    const toggleDbType = (typeId: string) => {
        if (selectedTypes.includes(typeId)) {
            setSelectedTypes(prev => prev.filter(t => t !== typeId));
            setDatabasesToCreate(prev => prev.filter(d => d.type !== typeId));
        } else {
            if (selectedTypes.length >= remainingDatabases) return;
            setSelectedTypes(prev => [...prev, typeId]);
            const dbType = DB_TYPES.find(d => d.id === typeId);
            if (dbType) {
                setDatabasesToCreate(prev => [...prev, newDatabaseToCreate(typeId, dbType.defaultName)]);
            }
        }
    };

    const updateDatabaseConfig = (type: string, field: keyof DatabaseToCreate, value: string) => {
        setDatabasesToCreate(prev => prev.map(db => db.type === type ? { ...db, [field]: value } : db));
    };

    const updateDatabaseTier = (type: string, tierIndex: number) => {
        setDatabasesToCreate(prev => prev.map(db => db.type === type ? { ...db, resourceTierIndex: tierIndex } : db));
    };

    const updateDatabaseEngineConfig = <K extends keyof DatabaseEngineConfig>(type: string, field: K, value: DatabaseEngineConfig[K]) => {
        setDatabasesToCreate(prev => prev.map(db => db.type === type ? { ...db, engineConfig: { ...db.engineConfig, [field]: value } } : db));
    };

    const toggleAdvanced = (type: string) => {
        setDatabasesToCreate(prev => prev.map(db => db.type === type ? { ...db, showAdvanced: !db.showAdvanced } : db));
    };

    const createAllDatabases = async () => {
        if (!serverId || databasesToCreate.length === 0) return;
        if (databasesToCreate.length > remainingDatabases) return;
        setIsCreating(true);

        for (const db of databasesToCreate) {
            setDatabasesToCreate(prev => prev.map(d => d.type === db.type ? { ...d, status: "creating" as const } : d));
            try {
                const tier = RESOURCE_TIERS[db.resourceTierIndex] || RESOURCE_TIERS[DEFAULT_RESOURCE_TIER_INDEX];
                const result = await api.createDatabase(serverId, {
                    name: db.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    type: db.type as "postgresql" | "mysql" | "mongodb" | "redis",
                    exposure: db.exposure,
                    cpuLimit: tier.cpuLimit,
                    memoryLimit: tier.memoryLimit,
                    engineConfig: Object.keys(db.engineConfig).length > 0 ? db.engineConfig : undefined,
                });
                setDatabasesToCreate(prev => prev.map(d => d.type === db.type ? { ...d, status: "creating" as const, createdId: result.id } : d));
            } catch (err) {
                setDatabasesToCreate(prev => prev.map(d => d.type === db.type ? { ...d, status: "error" as const, error: (err as Error).message } : d));
            }
            await new Promise(r => setTimeout(r, 500));
        }
        queryClient.invalidateQueries({ queryKey: ["allDatabases"] });
    };

    // Poll for provisioning status
    const inFlightIds = databasesToCreate.filter(d => d.createdId && d.status === "creating").map(d => d.createdId!).sort();
    const { data: liveDatabases } = useQuery({
        queryKey: ["new-database-poll", serverId, inFlightIds.join(",")],
        queryFn: () => api.getDatabases(serverId),
        enabled: serverId !== "" && inFlightIds.length > 0,
        refetchInterval: 2000,
    });

    useEffect(() => {
        if (!liveDatabases) return;
        setDatabasesToCreate(prev => {
            let changed = false;
            const next = prev.map(d => {
                if (!d.createdId || d.status !== "creating") return d;
                const live = liveDatabases.find(r => r.id === d.createdId);
                if (!live) return d;
                const s = String(live.status).toLowerCase();
                if (s === "running") { changed = true; return { ...d, status: "success" as const }; }
                if (s === "error") { changed = true; return { ...d, status: "error" as const, error: "Provisioning failed" }; }
                return d;
            });
            return changed ? next : prev;
        });
    }, [liveDatabases]);

    const allComplete = databasesToCreate.length > 0 && databasesToCreate.every(db => db.status === "success" || db.status === "error");
    const anySuccess = databasesToCreate.some(db => db.status === "success");

    if (databaseLimitReached) {
        return (
            <div className="dashboard-page">
                <div className="flex items-center gap-3 mb-6">
                    <Database size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Databases</h1>
                        <p className="text-sm text-muted-foreground">Deploy a database stack for your application in a few simple steps.</p>
                    </div>
                </div>
                <UpgradePrompt feature="databases" />
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Database size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Databases</h1>
                        <p className="text-sm text-muted-foreground">Deploy a database stack for your application in a few simple steps.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 bg-card text-xs" asChild>
                    <Link href="/databases"><ArrowLeft className="h-3.5 w-3.5" /> Back to Databases</Link>
                </Button>
            </div>

            <div className="max-w-4xl space-y-6">
                {/* Step 1: Select Server */}
                <div className="rounded-xl border border-border/60 bg-card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Select Target Server</h2>
                            <p className="text-xs text-muted-foreground">Choose the server where you want to deploy the database stack.</p>
                        </div>
                    </div>
                    {connectedServers.length === 0 ? (
                        <div className="text-center py-4">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-warning-text" />
                            <p className="text-sm font-medium text-foreground">No connected servers</p>
                            <p className="text-xs text-muted-foreground">Connect a server first to deploy databases</p>
                        </div>
                    ) : (
                        <Select value={serverId} onValueChange={setServerId}>
                            <SelectTrigger className="max-w-md h-9 border-border/60 bg-background">
                                <SelectValue placeholder="Select a server" />
                            </SelectTrigger>
                            <SelectContent>
                                {connectedServers.map((server) => (
                                    <SelectItem key={server.id} value={server.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-success" />
                                            {server.name || server.hostname} <span className="text-muted-foreground">({server.ip})</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Step 2: Select Databases */}
                <div className="rounded-xl border border-border/60 bg-card p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Select Databases to Install</h2>
                            <p className="text-xs text-muted-foreground">Pick one or more database engines to include in your stack.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {DB_TYPES.map((db) => {
                            const isSelected = selectedTypes.includes(db.id);
                            const atLimit = !isSelected && selectedTypes.length >= remainingDatabases;
                            return (
                                <button
                                    key={db.id}
                                    type="button"
                                    disabled={isCreating || atLimit}
                                    onClick={() => toggleDbType(db.id)}
                                    className={`relative p-5 rounded-xl border-2 text-center transition-all ${
                                        isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border/60 hover:border-primary/40 hover:shadow-sm"
                                    } ${isCreating || atLimit ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    {isSelected && (
                                        <div className="absolute -top-2 -right-2 h-5 w-5 bg-primary rounded flex items-center justify-center">
                                            <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    )}
                                    <DatabaseBrandIcon engine={db.id} size={48} className="mx-auto mb-2" />
                                    <p className="font-semibold text-foreground text-sm">{db.name}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{db.description}</p>
                                    <div className="flex flex-wrap gap-1 mt-3 justify-center">
                                        {db.features.map(f => (
                                            <span key={f} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{f}</span>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Install Button */}
                {!isCreating && !allComplete && (
                    <Button
                        onClick={createAllDatabases}
                        disabled={!serverId || databasesToCreate.length === 0 || databasesToCreate.length > remainingDatabases}
                        className="w-full h-12 text-base rounded-xl"
                    >
                        <Zap className="h-5 w-5 mr-2" />
                        Install {databasesToCreate.length} Database{databasesToCreate.length !== 1 ? "s" : ""}
                    </Button>
                )}

                {isCreating && !allComplete && (
                    <Button disabled className="w-full h-12 text-base rounded-xl">
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Installing Databases...
                    </Button>
                )}

                {allComplete && (
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1 h-11" asChild>
                            <Link href="/databases">View All Databases</Link>
                        </Button>
                        {anySuccess && (
                            <Button className="flex-1 h-11" onClick={() => {
                                const successDb = databasesToCreate.find(d => d.status === "success");
                                if (successDb?.createdId) router.push(`/databases/${successDb.createdId}?server=${serverId}`);
                            }}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Open First Database
                            </Button>
                        )}
                    </div>
                )}

                {/* Configuration (shown when types selected) */}
                {databasesToCreate.length > 0 && (
                    <div className="space-y-3">
                        {databasesToCreate.map((db) => {
                            const dbType = DB_TYPES.find(d => d.id === db.type);
                            if (!dbType) return null;
                            return (
                                <div key={db.type} className={`rounded-xl border-2 p-4 transition-all ${
                                    db.status === "success" ? "border-success/40 bg-success-muted" :
                                    db.status === "error" ? "border-danger/40 bg-danger-muted" :
                                    db.status === "creating" ? "border-info/40 bg-info-muted" : "border-border/60 bg-card"
                                }`}>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <DatabaseBrandIcon engine={dbType.id} size={28} />
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{dbType.name}</p>
                                                {db.status === "creating" && <span className="text-[11px] text-info-text flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Installing...</span>}
                                                {db.status === "success" && <span className="text-[11px] text-success-text flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Installed</span>}
                                                {db.status === "error" && <span className="text-[11px] text-danger-text flex items-center gap-1"><XCircle className="h-3 w-3" />Failed</span>}
                                            </div>
                                        </div>
                                        <Input
                                            placeholder={`${dbType.defaultName}-db`}
                                            value={db.name}
                                            disabled={isCreating}
                                            onChange={(e) => updateDatabaseConfig(db.type, "name", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                                            className="h-8 flex-1 border-border/60 bg-background text-sm"
                                        />
                                        <div className="flex gap-1">
                                            <button type="button" disabled={isCreating} onClick={() => updateDatabaseConfig(db.type, "exposure", "internal")}
                                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${db.exposure === "internal" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                                                Internal
                                            </button>
                                            <button type="button" disabled={isCreating} onClick={() => updateDatabaseConfig(db.type, "exposure", "public")}
                                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${db.exposure === "public" ? "bg-warning text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                                                Public
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center gap-3">
                                        <Select
                                            value={String(db.resourceTierIndex)}
                                            onValueChange={(value) => updateDatabaseTier(db.type, Number(value))}
                                            disabled={isCreating}
                                        >
                                            <SelectTrigger className="h-8 max-w-[220px] border-border/60 bg-background text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {RESOURCE_TIERS.map((tier, index) => (
                                                    <SelectItem key={tier.label} value={String(index)}>{tier.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <button
                                            type="button"
                                            disabled={isCreating}
                                            onClick={() => toggleAdvanced(db.type)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <SlidersHorizontal className="h-3.5 w-3.5" />
                                            Advanced configuration
                                        </button>
                                    </div>

                                    {db.showAdvanced && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border/50 bg-background/50 p-3">
                                            {(db.type === "postgresql" || db.type === "mysql") && (
                                                <div className="space-y-1">
                                                    <Label htmlFor={`${db.type}-maxConnections`} className="text-[11px]">
                                                        Max connections (10–500)
                                                    </Label>
                                                    <Input
                                                        id={`${db.type}-maxConnections`}
                                                        type="number"
                                                        min={10}
                                                        max={500}
                                                        disabled={isCreating}
                                                        placeholder="Default"
                                                        value={db.engineConfig.maxConnections ?? ""}
                                                        onChange={(e) => updateDatabaseEngineConfig(
                                                            db.type,
                                                            "maxConnections",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )}
                                                        className="h-8 border-border/60 bg-background text-sm"
                                                    />
                                                </div>
                                            )}
                                            {db.type === "postgresql" && (
                                                <div className="space-y-1">
                                                    <Label htmlFor="postgresql-sharedBuffers" className="text-[11px]">
                                                        Shared buffers (10–40% of memory)
                                                    </Label>
                                                    <Input
                                                        id="postgresql-sharedBuffers"
                                                        type="number"
                                                        min={10}
                                                        max={40}
                                                        disabled={isCreating}
                                                        placeholder="Default (~25%)"
                                                        value={db.engineConfig.sharedBuffersPercent ?? ""}
                                                        onChange={(e) => updateDatabaseEngineConfig(
                                                            db.type,
                                                            "sharedBuffersPercent",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )}
                                                        className="h-8 border-border/60 bg-background text-sm"
                                                    />
                                                </div>
                                            )}
                                            {db.type === "mysql" && (
                                                <div className="space-y-1">
                                                    <Label htmlFor="mysql-innodbBufferPool" className="text-[11px]">
                                                        InnoDB buffer pool (10–70% of memory)
                                                    </Label>
                                                    <Input
                                                        id="mysql-innodbBufferPool"
                                                        type="number"
                                                        min={10}
                                                        max={70}
                                                        disabled={isCreating}
                                                        placeholder="Default"
                                                        value={db.engineConfig.innodbBufferPoolPercent ?? ""}
                                                        onChange={(e) => updateDatabaseEngineConfig(
                                                            db.type,
                                                            "innodbBufferPoolPercent",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )}
                                                        className="h-8 border-border/60 bg-background text-sm"
                                                    />
                                                </div>
                                            )}
                                            {db.type === "mongodb" && (
                                                <div className="space-y-1">
                                                    <Label htmlFor="mongodb-wiredTigerCache" className="text-[11px]">
                                                        WiredTiger cache (10–50% of memory)
                                                    </Label>
                                                    <Input
                                                        id="mongodb-wiredTigerCache"
                                                        type="number"
                                                        min={10}
                                                        max={50}
                                                        disabled={isCreating}
                                                        placeholder="Default"
                                                        value={db.engineConfig.wiredTigerCachePercent ?? ""}
                                                        onChange={(e) => updateDatabaseEngineConfig(
                                                            db.type,
                                                            "wiredTigerCachePercent",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )}
                                                        className="h-8 border-border/60 bg-background text-sm"
                                                    />
                                                </div>
                                            )}
                                            {db.type === "redis" && (
                                                <div className="space-y-1">
                                                    <Label htmlFor="redis-maxmemoryPolicy" className="text-[11px]">
                                                        Eviction policy
                                                    </Label>
                                                    <Select
                                                        value={db.engineConfig.maxmemoryPolicy ?? "noeviction"}
                                                        onValueChange={(value) => updateDatabaseEngineConfig(db.type, "maxmemoryPolicy", value)}
                                                        disabled={isCreating}
                                                    >
                                                        <SelectTrigger id="redis-maxmemoryPolicy" className="h-8 border-border/60 bg-background text-sm">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {REDIS_MAXMEMORY_POLICIES.map((policy) => (
                                                                <SelectItem key={policy} value={policy}>{policy}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {db.error && <p className="mt-2 text-xs text-danger-text">{db.error}</p>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Quick Start Stacks */}
                {!isCreating && databasesToCreate.length === 0 && (
                    <div className="rounded-xl border border-border/60 bg-card p-6">
                        <h3 className="text-sm font-semibold text-foreground mb-1">Quick Start Stacks</h3>
                        <p className="text-xs text-muted-foreground mb-4">Deploy commonly used database combinations with a single click.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <button disabled={remainingDatabases < 2} onClick={() => { setSelectedTypes(["postgresql", "redis"]); setDatabasesToCreate([newDatabaseToCreate("postgresql", "app-db"), newDatabaseToCreate("redis", "cache")]); }}
                                className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors text-left disabled:opacity-50">
                                <div className="flex items-center gap-1">
                                    <Database size={20} /><span className="text-muted-foreground text-xs">+</span><Database size={20} />
                                </div>
                                <div className="flex-1"><div className="text-xs font-medium text-foreground">Web App Stack</div></div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button disabled={remainingDatabases < 2} onClick={() => { setSelectedTypes(["mongodb", "redis"]); setDatabasesToCreate([newDatabaseToCreate("mongodb", "data"), newDatabaseToCreate("redis", "cache")]); }}
                                className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors text-left disabled:opacity-50">
                                <div className="flex items-center gap-1">
                                    <Database size={20} /><span className="text-muted-foreground text-xs">+</span><Database size={20} />
                                </div>
                                <div className="flex-1"><div className="text-xs font-medium text-foreground">NoSQL Stack</div></div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button disabled={remainingDatabases < 3} onClick={() => { setSelectedTypes(["postgresql", "mongodb", "redis"]); setDatabasesToCreate([newDatabaseToCreate("postgresql", "relational"), newDatabaseToCreate("mongodb", "documents"), newDatabaseToCreate("redis", "cache")]); }}
                                className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors text-left disabled:opacity-50">
                                <div className="flex items-center gap-1">
                                    <Database size={20} /><span className="text-muted-foreground text-xs">+</span><Database size={20} /><span className="text-muted-foreground text-xs">+</span><Database size={20} />
                                </div>
                                <div className="flex-1"><div className="text-xs font-medium text-foreground">Full Stack</div></div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
