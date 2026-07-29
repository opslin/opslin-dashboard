"use client";

import { useRef, useState, useMemo } from "react";
import { Check, Copy, Database as DatabaseIcon, Eye, EyeOff, FileUp, Info, Loader2, MoreVertical, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EnvVar } from "@/components/ui/env-vars-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuickDatabaseConnectDialog } from "@/components/apps/sections/QuickDatabaseConnectDialog";
import type { App } from "@/lib/api";
import { cn } from "@/lib/utils";

type EnvironmentSectionProps = {
    appStatus: App["status"];
    serverId: string;
    envVars: EnvVar[];
    envVarsChanged: boolean;
    deleteLocked: boolean;
    savePending: boolean;
    saveAndRedeployPending: boolean;
    deployPending: boolean;
    onChange: (vars: EnvVar[]) => void;
    onSave: () => void;
    onSaveAndRedeploy: () => void;
};

type Scope = "all" | "production" | "preview" | "development";

const SCOPE_LABEL: Record<Scope, string> = {
    all: "All Environments",
    production: "Production",
    preview: "Preview",
    development: "Development",
};

const SCOPE_BADGE: Record<Scope, string> = {
    all: "bg-info-muted text-info-text border-info/30",
    production: "bg-brand-muted text-brand border-border",
    preview: "bg-chart-violet/10 text-chart-violet border-chart-violet/30",
    development: "bg-warning-muted text-warning-text border-warning/30",
};

function inferScope(key: string): Scope {
    const k = key.toLowerCase();
    if (k.includes("prod")) return "production";
    if (k.includes("preview") || k.includes("staging")) return "preview";
    if (k.includes("dev") || k.includes("local")) return "development";
    return "all";
}

function isSecretKey(key: string) {
    const k = key.toLowerCase();
    return k.includes("secret") || k.includes("password") || k.includes("token") || k.includes("dsn") || k.endsWith("_key") || k === "key";
}

async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error("Failed to copy");
    }
}

export function EnvironmentSection({
    appStatus,
    serverId,
    envVars,
    envVarsChanged,
    deleteLocked,
    savePending,
    saveAndRedeployPending,
    deployPending,
    onChange,
    onSave,
    onSaveAndRedeploy,
}: EnvironmentSectionProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const [scopes, setScopes] = useState<Map<number, Scope>>(new Map());
    const [draftKey, setDraftKey] = useState("");
    const [draftValue, setDraftValue] = useState("");
    const [draftScope, setDraftScope] = useState<Scope>("all");
    const [hidePreview, setHidePreview] = useState(false);
    const [connectDialogOpen, setConnectDialogOpen] = useState(false);

    const handleDbConnectInject = (vars: EnvVar[], sourceLabel: string) => {
        if (vars.length === 0) return;
        onChange([...envVars, ...vars]);
        toast.success(`Added ${vars.length} variable${vars.length === 1 ? "" : "s"} from ${sourceLabel}`);
    };

    const scopeFor = (i: number, key: string): Scope => scopes.get(i) ?? inferScope(key);

    const toggleReveal = (i: number) => {
        const next = new Set(revealed);
        if (next.has(i)) next.delete(i); else next.add(i);
        setRevealed(next);
    };

    const updateScope = (i: number, scope: Scope) => {
        const next = new Map(scopes);
        next.set(i, scope);
        setScopes(next);
    };

    const updateValue = (i: number, value: string) => {
        if (deleteLocked) return;
        const updated = [...envVars];
        updated[i] = { ...updated[i], value };
        onChange(updated);
    };

    const updateKey = (i: number, key: string) => {
        if (deleteLocked) return;
        const sanitized = key.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const updated = [...envVars];
        updated[i] = { ...updated[i], key: sanitized };
        onChange(updated);
    };

    const removeVar = (i: number) => {
        if (deleteLocked) return;
        onChange(envVars.filter((_, idx) => idx !== i));
        const r = new Set(revealed); r.delete(i); setRevealed(r);
    };

    const addDraft = () => {
        if (deleteLocked) return;
        if (!draftKey.trim()) {
            toast.error("Variable name is required");
            return;
        }
        const sanitized = draftKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        if (envVars.some(v => v.key === sanitized)) {
            toast.error(`${sanitized} already exists`);
            return;
        }
        onChange([...envVars, { key: sanitized, value: draftValue, isSecret: isSecretKey(sanitized) }]);
        const newIndex = envVars.length;
        const next = new Map(scopes);
        next.set(newIndex, draftScope);
        setScopes(next);
        setDraftKey("");
        setDraftValue("");
        setDraftScope("all");
    };

    const handleEnvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (deleteLocked) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const newVars: EnvVar[] = [];
            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eq = trimmed.indexOf("=");
                if (eq === -1) continue;
                const key = trimmed.slice(0, eq).trim();
                let value = trimmed.slice(eq + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                newVars.push({ key, value, isSecret: isSecretKey(key) });
            }
            if (newVars.length > 0) {
                onChange([...envVars, ...newVars]);
                toast.success(`Imported ${newVars.length} variable${newVars.length === 1 ? "" : "s"}`);
            } else {
                toast.error("No valid variables found in file");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleSaveAndRedeploy = () => {
        if (appStatus === "running" && typeof window !== "undefined") {
            const confirmed = window.confirm("Save environment changes and redeploy this app?");
            if (!confirmed) return;
        }
        onSaveAndRedeploy();
    };

    const totalCount = useMemo(() => envVars.length, [envVars]);

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm">
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">Environment Variables</h2>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Manage environment variables, secrets, and configuration.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {envVarsChanged && (
                        <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-muted px-2.5 py-0.5 text-[11px] font-medium text-warning-text">
                            Unsaved changes
                        </span>
                    )}
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border text-xs" onClick={() => setConnectDialogOpen(true)} disabled={deleteLocked || !serverId}>
                        <DatabaseIcon className="h-3.5 w-3.5" /> Connect Database
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border text-xs" onClick={() => fileInputRef.current?.click()} disabled={deleteLocked}>
                        <FileUp className="h-3.5 w-3.5" /> Import from .env
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".env,.env.local,.env.production,text/plain" onChange={handleEnvFileUpload} className="hidden" />
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={addDraft} disabled={deleteLocked || !draftKey.trim()}>
                        <Plus className="h-3.5 w-3.5" /> Add Variable
                    </Button>
                </div>
            </div>

            {/* Info banner */}
            <div className="px-5 pt-4">
                <div className="flex items-start gap-2 rounded-lg bg-info-muted border border-info/20 px-3 py-2.5">
                    <Info className="h-4 w-4 text-info-text mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground/90 leading-relaxed">
                        Frontend frameworks expose only public prefixes such as <code className="font-mono text-info-text bg-info-muted px-1 rounded">VITE_</code>, <code className="font-mono text-info-text bg-info-muted px-1 rounded">REACT_APP_</code>, <code className="font-mono text-info-text bg-info-muted px-1 rounded">NEXT_PUBLIC_</code>, <code className="font-mono text-info-text bg-info-muted px-1 rounded">PUBLIC_</code>, <code className="font-mono text-info-text bg-info-muted px-1 rounded">NG_APP_</code>, or <code className="font-mono text-info-text bg-info-muted px-1 rounded">ANGULAR_APP_</code>. Private values like <code className="font-mono text-info-text bg-info-muted px-1 rounded">DATABASE_URL</code> & <code className="font-mono text-info-text bg-info-muted px-1 rounded">JWT_SECRET</code> stay server-side.
                    </p>
                </div>
            </div>

            {deleteLocked && (
                <div className="px-5 pt-3">
                    <div className="rounded-lg border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning-text">
                        Environment changes are paused while cleanup is pending.
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="px-5 py-4">
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[28%]">Variable Name</th>
                                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Value</th>
                                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[180px]">Scopes</th>
                                <th className="text-right py-2.5 px-3 w-[120px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Draft (new variable) row */}
                            <tr className="border-b border-border/60 bg-muted/10">
                                <td className="py-2.5 px-3">
                                    <Input
                                        value={draftKey}
                                        onChange={e => setDraftKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                                        placeholder="e.g. DATABASE_URL"
                                        className="h-9 border-border bg-background font-mono text-xs"
                                        disabled={deleteLocked}
                                    />
                                </td>
                                <td className="py-2.5 px-3">
                                    <Input
                                        value={draftValue}
                                        onChange={e => setDraftValue(e.target.value)}
                                        placeholder="e.g. postgres://user:pass@host:5432/db"
                                        className="h-9 border-border bg-background font-mono text-xs"
                                        disabled={deleteLocked}
                                    />
                                </td>
                                <td className="py-2.5 px-3">
                                    <Select value={draftScope} onValueChange={(v) => setDraftScope(v as Scope)}>
                                        <SelectTrigger className="h-9 border-border bg-background text-xs"><SelectValue placeholder="Select scope" /></SelectTrigger>
                                        <SelectContent>
                                            {(["all", "production", "preview", "development"] as Scope[]).map(s => (
                                                <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="py-2.5 px-3">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setHidePreview(!hidePreview)}
                                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                            title={hidePreview ? "Show drafted value" : "Hide drafted value"}
                                        >
                                            {hidePreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            <span>{hidePreview ? "Show" : "Hide"}</span>
                                        </button>
                                        <Button
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={addDraft}
                                            disabled={deleteLocked || !draftKey.trim()}
                                            title="Add variable"
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>

                            {/* Existing rows */}
                            {envVars.map((envVar, i) => {
                                const isSecret = envVar.isSecret ?? isSecretKey(envVar.key);
                                const scope = scopeFor(i, envVar.key);
                                const isRevealed = revealed.has(i);
                                const display = isSecret && !isRevealed ? "•".repeat(Math.max(8, Math.min(envVar.value.length, 20))) : envVar.value;
                                return (
                                    <tr key={`${envVar.key}-${i}`} className="border-b border-border/40 last:border-b-0 hover:bg-muted/15 transition-colors">
                                        <td className="py-3 px-3">
                                            <div className="flex items-center gap-1.5">
                                                <Input
                                                    value={envVar.key}
                                                    onChange={e => updateKey(i, e.target.value)}
                                                    className="h-8 border-transparent shadow-none px-2 font-mono text-xs hover:border-border focus:border-primary/40"
                                                    disabled={deleteLocked}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(envVar.key, "Variable name")}
                                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                    title="Copy variable name"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="flex items-center gap-2">
                                                {isSecret && !isRevealed ? (
                                                    <span className="font-mono text-xs text-foreground tracking-wider flex items-center gap-1.5">
                                                        {display}
                                                        <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-muted text-[9px]">🔒</span>
                                                    </span>
                                                ) : (
                                                    <Input
                                                        type="text"
                                                        value={envVar.value}
                                                        onChange={e => updateValue(i, e.target.value)}
                                                        className="h-8 border-transparent shadow-none px-2 font-mono text-xs hover:border-border focus:border-primary/40"
                                                        disabled={deleteLocked}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <Select value={scope} onValueChange={(v) => updateScope(i, v as Scope)}>
                                                <SelectTrigger className={cn("h-7 text-[11px] border-0 px-2 rounded-full font-medium w-auto inline-flex", SCOPE_BADGE[scope])}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(["all", "production", "preview", "development"] as Scope[]).map(s => (
                                                        <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleReveal(i)}
                                                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                    title={isRevealed ? "Hide value" : "Show value"}
                                                >
                                                    {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(envVar.value, "Value")}
                                                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                    title="Copy value"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50">
                                                            <MoreVertical className="h-3.5 w-3.5" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => copyText(`${envVar.key}=${envVar.value}`, "KEY=VALUE")}>
                                                            <Copy className="h-3.5 w-3.5 mr-2" /> Copy as KEY=VALUE
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => removeVar(i)} className="text-danger-text">
                                                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {envVars.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                        No environment variables yet. Add one above to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalCount > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                        {totalCount} variable{totalCount === 1 ? "" : "s"} configured
                    </p>
                )}
            </div>

            {/* Footer actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border px-5 py-3.5 bg-muted/20">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 border-border text-sm"
                        onClick={onSave}
                        disabled={!envVarsChanged || savePending || deleteLocked}
                    >
                        {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Only
                    </Button>
                    <Button
                        size="sm"
                        className="h-9 gap-2 text-sm font-medium"
                        onClick={handleSaveAndRedeploy}
                        disabled={!envVarsChanged || saveAndRedeployPending || savePending || deployPending || deleteLocked}
                    >
                        {saveAndRedeployPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                        Save & Redeploy
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3 w-3" />
                    Redeploy is required for changes to take effect.
                </p>
            </div>

            {serverId && (
                <QuickDatabaseConnectDialog
                    serverId={serverId}
                    open={connectDialogOpen}
                    onOpenChange={setConnectDialogOpen}
                    existingKeys={new Set(envVars.map(v => v.key))}
                    onInject={handleDbConnectInject}
                />
            )}
        </div>
    );
}
