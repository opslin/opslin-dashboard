"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle, Check, CheckCircle2, Copy, Database as DatabaseIcon,
    Eye, EyeOff, Loader2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { usePlan } from "@/hooks/usePlan";
import { api, type CreateDatabaseInput, type Database } from "@/lib/api";
import type { EnvVar } from "@/components/ui/env-vars-editor";
import {
    buildEnvVarsForDatabase, credentialFieldsForDatabase, dedupeEnvVarKeys,
    deriveEnvVarNames, sanitizeEnvPrefix,
} from "@/lib/db-connection";

type Step = "select" | "create" | "review";

const ENGINES: { id: CreateDatabaseInput["type"]; label: string; defaultName: string }[] = [
    { id: "postgresql", label: "PostgreSQL", defaultName: "app-db" },
    { id: "mysql", label: "MySQL", defaultName: "app-db" },
    { id: "mongodb", label: "MongoDB", defaultName: "app-db" },
    { id: "redis", label: "Redis", defaultName: "cache" },
];

function dbTypeLabel(type: string) {
    switch (type.toLowerCase()) {
        case "postgresql": return "PostgreSQL";
        case "mysql": return "MySQL";
        case "mongodb": return "MongoDB";
        case "redis": return "Redis";
        default: return type;
    }
}

type QuickDatabaseConnectDialogProps = {
    serverId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    existingKeys: Set<string>;
    onInject: (vars: EnvVar[], sourceLabel: string) => void;
};

export function QuickDatabaseConnectDialog({
    serverId, open, onOpenChange, existingKeys, onInject,
}: QuickDatabaseConnectDialogProps) {
    const queryClient = useQueryClient();
    const { isAtLimit, loading: planLoading } = usePlan();

    const [step, setStep] = useState<Step>("select");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [pendingCreateId, setPendingCreateId] = useState<string | null>(null);
    const [newName, setNewName] = useState(ENGINES[0].defaultName);
    const [newType, setNewType] = useState<CreateDatabaseInput["type"]>("postgresql");
    const [passwords, setPasswords] = useState<Record<string, string | null>>({});
    const [passwordsLoading, setPasswordsLoading] = useState(false);
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    const [prefixOverrides, setPrefixOverrides] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState<string | null>(null);

    const { data: databases = [], isLoading: databasesLoading } = useQuery({
        queryKey: ["quick-connect-databases", serverId],
        queryFn: () => api.getDatabases(serverId),
        enabled: open && !!serverId,
        refetchInterval: pendingCreateId ? 2000 : false,
    });

    useEffect(() => {
        if (!pendingCreateId) return;
        const match = databases.find(d => d.id === pendingCreateId);
        if (!match) return;
        if (match.status === "running") {
            setSelectedIds(prev => new Set(prev).add(match.id));
            setPendingCreateId(null);
            setStep("select");
            toast.success(`${match.name} is ready`);
        } else if (match.status === "error") {
            setPendingCreateId(null);
            toast.error(`${match.name} failed to provision`);
            setStep("select");
        }
    }, [databases, pendingCreateId]);

    const createMutation = useMutation({
        mutationFn: (input: CreateDatabaseInput) => api.createDatabase(serverId, input),
        onSuccess: (db) => {
            setPendingCreateId(db.id);
            queryClient.invalidateQueries({ queryKey: ["quick-connect-databases", serverId] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to create database");
        },
    });

    const selectedDatabases = useMemo(
        () => databases.filter(d => selectedIds.has(d.id)),
        [databases, selectedIds]
    );

    useEffect(() => {
        if (step !== "review") return;
        const toFetch = selectedDatabases.filter(db => db.type !== "redis" && !(db.id in passwords));
        if (toFetch.length === 0) return;
        setPasswordsLoading(true);
        Promise.all(toFetch.map(async (db) => {
            try {
                const res = await api.getDbPassword(serverId, db.id);
                return [db.id, res.password] as const;
            } catch {
                return [db.id, null] as const;
            }
        })).then((entries) => {
            setPasswords(prev => {
                const next = { ...prev };
                for (const [id, pw] of entries) next[id] = pw;
                return next;
            });
        }).finally(() => setPasswordsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, selectedDatabases, serverId]);

    const defaultPrefixes = useMemo(() => deriveEnvVarNames(selectedDatabases), [selectedDatabases]);
    const prefixFor = (id: string) => prefixOverrides[id] ?? defaultPrefixes.get(id) ?? "DATABASE";

    const { vars: finalVars, renamed: renamedKeys } = useMemo(() => {
        const raw: EnvVar[] = [];
        for (const db of selectedDatabases) {
            const prefix = sanitizeEnvPrefix(prefixFor(db.id)) || "DATABASE";
            raw.push(...buildEnvVarsForDatabase(db, passwords[db.id] ?? null, prefix));
        }
        return dedupeEnvVarKeys(raw, existingKeys);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDatabases, passwords, prefixOverrides, existingKeys]);

    function resetState() {
        setStep("select");
        setSelectedIds(new Set());
        setPendingCreateId(null);
        setNewName(ENGINES[0].defaultName);
        setNewType("postgresql");
        setPasswords({});
        setRevealed(new Set());
        setPrefixOverrides({});
        createMutation.reset();
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) resetState();
        onOpenChange(nextOpen);
    }

    function toggleSelected(id: string, running: boolean) {
        if (!running) return;
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function handleCreateSubmit() {
        const name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!name) {
            toast.error("Database name is required");
            return;
        }
        createMutation.mutate({ name, type: newType, exposure: "internal" });
    }

    async function copy(text: string, key: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    }

    function handleConfirmInject() {
        const label = selectedDatabases.map(d => d.name).join(", ");
        onInject(finalVars, label);
        handleOpenChange(false);
    }

    const databaseLimitReached = !planLoading && isAtLimit("database");

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Quick Database Connect</DialogTitle>
                    <DialogDescription>
                        {step === "select" && "Pick one or more databases on this server to connect to this app."}
                        {step === "create" && "Spin up a new database in a few seconds."}
                        {step === "review" && "Review credentials, then add them as environment variables."}
                    </DialogDescription>
                </DialogHeader>

                {step === "select" && (
                    <div className="space-y-3">
                        {databasesLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : databases.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-6 text-center">
                                <DatabaseIcon className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                <p className="text-sm text-foreground font-medium">No databases on this server yet</p>
                                <p className="text-xs text-muted-foreground mt-0.5 mb-4">Create one to connect it to this app.</p>
                                {databaseLimitReached ? (
                                    <UpgradePrompt feature="databases" />
                                ) : (
                                    <Button size="sm" onClick={() => setStep("create")}>
                                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first database
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                                    {databases.map((db) => {
                                        const running = db.status === "running";
                                        const isSelected = selectedIds.has(db.id);
                                        return (
                                            <button
                                                key={db.id}
                                                type="button"
                                                disabled={!running}
                                                onClick={() => toggleSelected(db.id, running)}
                                                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                                                } ${!running ? "opacity-50 cursor-not-allowed" : ""}`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                                                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-foreground">{db.name}</div>
                                                        <div className="text-[11px] text-muted-foreground">{dbTypeLabel(db.type)}</div>
                                                    </div>
                                                </div>
                                                <span className={`inline-flex items-center gap-1.5 text-[11px] ${running ? "text-success-text" : "text-muted-foreground"}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-success" : "bg-muted-foreground"}`} />
                                                    {running ? "Running" : db.status === "creating" ? "Provisioning…" : db.status}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    {databaseLimitReached ? (
                                        <UpgradePrompt feature="databases" compact />
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={() => setStep("create")}>
                                            <Plus className="h-3.5 w-3.5 mr-1.5" /> New database
                                        </Button>
                                    )}
                                    <Button size="sm" disabled={selectedIds.size === 0} onClick={() => setStep("review")}>
                                        Continue ({selectedIds.size} selected)
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {step === "create" && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {ENGINES.map((engine) => (
                                <button
                                    key={engine.id}
                                    type="button"
                                    onClick={() => { setNewType(engine.id); setNewName(engine.defaultName); }}
                                    className={`rounded-lg border-2 px-3 py-3 text-center text-xs font-medium transition-colors ${
                                        newType === engine.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                                    }`}
                                >
                                    {engine.label}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="qc-db-name">Database name</Label>
                            <Input
                                id="qc-db-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="app-db"
                                disabled={createMutation.isPending || !!pendingCreateId}
                            />
                        </div>
                        {pendingCreateId && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Provisioning… this can take a minute.
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep("select")} disabled={createMutation.isPending || !!pendingCreateId}>
                                Back
                            </Button>
                            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending || !!pendingCreateId}>
                                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Create Database
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === "review" && (
                    <div className="space-y-4">
                        {selectedDatabases.map((db) => {
                            const fields = credentialFieldsForDatabase(db, passwords[db.id] ?? null);
                            const isRevealed = revealed.has(db.id);
                            const prefix = prefixFor(db.id);
                            return (
                                <div key={db.id} className="rounded-lg border border-border p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-semibold text-foreground">{db.name}</span>
                                            <span className="text-[11px] text-muted-foreground">{dbTypeLabel(db.type)}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setRevealed(prev => {
                                                const next = new Set(prev);
                                                if (next.has(db.id)) next.delete(db.id); else next.add(db.id);
                                                return next;
                                            })}
                                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            {isRevealed ? "Hide" : "Show"} credentials
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                        {([
                                            ["URL", fields.url, "url"],
                                            ["Host", fields.host, "host"],
                                            ["Port", fields.port, "port"],
                                            ["Name", fields.name, "name"],
                                            ...(fields.user ? [["User", fields.user, "user"] as const] : []),
                                            ...(fields.password ? [["Password", fields.password, "password"] as const] : []),
                                        ] as [string, string, string][]).map(([label, value, fieldKey]) => {
                                            const isSecretField = fieldKey === "url" || fieldKey === "password";
                                            const displayValue = isSecretField && !isRevealed && value
                                                ? "•".repeat(Math.min(20, Math.max(8, value.length)))
                                                : value || "—";
                                            return (
                                                <div key={fieldKey} className={fieldKey === "url" ? "col-span-2 flex items-center justify-between gap-2" : "flex items-center justify-between gap-2"}>
                                                    <span className="text-muted-foreground shrink-0">{label}</span>
                                                    <span className="flex items-center gap-1 min-w-0">
                                                        <code className="font-mono text-foreground truncate">{displayValue}</code>
                                                        <button type="button" onClick={() => copy(value, `${db.id}-${fieldKey}`)} className="p-0.5 text-muted-foreground hover:text-foreground shrink-0">
                                                            {copied === `${db.id}-${fieldKey}` ? <CheckCircle2 className="h-3 w-3 text-success-text" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {passwordsLoading && !(db.id in passwords) && db.type !== "redis" && (
                                            <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Fetching password…
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                                        <Label htmlFor={`qc-prefix-${db.id}`} className="text-[11px] text-muted-foreground shrink-0">Variable prefix</Label>
                                        <Input
                                            id={`qc-prefix-${db.id}`}
                                            value={prefix}
                                            onChange={(e) => setPrefixOverrides(prev => ({ ...prev, [db.id]: sanitizeEnvPrefix(e.target.value) }))}
                                            className="h-7 text-xs font-mono"
                                        />
                                    </div>
                                </div>
                            );
                        })}

                        <div className="rounded-lg bg-muted/30 border border-border p-3">
                            <p className="text-[11px] font-medium text-muted-foreground mb-2">
                                Will add {finalVars.length} variable{finalVars.length === 1 ? "" : "s"}:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {finalVars.map((v) => (
                                    <code key={v.key} className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 text-foreground">
                                        {v.key}
                                    </code>
                                ))}
                            </div>
                            {renamedKeys.size > 0 && (
                                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-warning-text">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>
                                        {Array.from(renamedKeys.entries()).map(([from, to]) => `${from} already exists, using ${to}`).join("; ")}
                                    </span>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep("select")}>Back</Button>
                            <Button onClick={handleConfirmInject} disabled={finalVars.length === 0}>
                                Add to Environment Variables
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
