"use client";

import { useRef, useState } from "react";
import { Copy, Database as DatabaseIcon, Download, Eye, EyeOff, HelpCircle, Info, Loader2, MoreHorizontal, Pencil, Plus, Rocket, Trash2, X } from "lucide-react";
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
    /** Number of unapplied changes, shown in the bottom bar. */
    changeCount?: number;
    onDiscard?: () => void;
};

type Scope = "all" | "production" | "preview" | "development";

const SCOPE_LABEL: Record<Scope, string> = {
    all: "All environments",
    production: "Production",
    preview: "Preview",
    development: "Development",
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
    changeCount,
    onDiscard,
}: EnvironmentSectionProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const [scopes, setScopes] = useState<Map<number, Scope>>(new Map());
    const [adding, setAdding] = useState(false);
    const [draftKey, setDraftKey] = useState("");
    const [draftValue, setDraftValue] = useState("");
    const [draftScope, setDraftScope] = useState<Scope>("all");
    const [editing, setEditing] = useState<number | null>(null);
    const [connectDialogOpen, setConnectDialogOpen] = useState(false);

    const handleDbConnectInject = (vars: EnvVar[], sourceLabel: string) => {
        if (vars.length === 0) return;
        onChange([...envVars, ...vars]);
        toast.success(`Added ${vars.length} variable${vars.length === 1 ? "" : "s"} from ${sourceLabel}`);
    };

    const scopeFor = (i: number, key: string): Scope => scopes.get(i) ?? inferScope(key);

    const toggleReveal = (i: number) => {
        const next = new Set(revealed);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        setRevealed(next);
    };

    const updateValue = (i: number, value: string) => {
        if (deleteLocked) return;
        const updated = [...envVars];
        updated[i] = { ...updated[i], value };
        onChange(updated);
    };

    const removeVar = (i: number) => {
        if (deleteLocked) return;
        onChange(envVars.filter((_, idx) => idx !== i));
        const r = new Set(revealed);
        r.delete(i);
        setRevealed(r);
        setEditing(null);
    };

    const closeAdd = () => {
        setAdding(false);
        setDraftKey("");
        setDraftValue("");
        setDraftScope("all");
    };

    const addDraft = () => {
        if (deleteLocked) return;
        if (!draftKey.trim()) {
            toast.error("Variable name is required");
            return;
        }
        const sanitized = draftKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        if (envVars.some((v) => v.key === sanitized)) {
            toast.error(`${sanitized} already exists`);
            return;
        }
        onChange([...envVars, { key: sanitized, value: draftValue, isSecret: isSecretKey(sanitized) }]);
        const next = new Map(scopes);
        next.set(envVars.length, draftScope);
        setScopes(next);
        closeAdd();
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

    const count = changeCount ?? 0;
    const busy = savePending || saveAndRedeployPending;

    return (
        <section className="space-y-5 pb-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Environment variables</h2>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        Secret settings your app needs, like database links.
                        <span title="Names starting with NEXT_PUBLIC_, VITE_ or REACT_APP_ are visible in the browser. Keep secrets out of them.">
                            <HelpCircle className="size-4" aria-label="Names starting with NEXT_PUBLIC_, VITE_ or REACT_APP_ are visible in the browser." />
                        </span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="lg" onClick={() => fileInputRef.current?.click()} disabled={deleteLocked}>
                        <Download aria-hidden="true" /> Import .env
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".env,.env.local,.env.production,text/plain" onChange={handleEnvFileUpload} className="hidden" aria-label="Import .env file" />
                    <Button variant="outline" size="lg" onClick={() => setConnectDialogOpen(true)} disabled={deleteLocked || !serverId}>
                        <DatabaseIcon aria-hidden="true" /> Connect database
                    </Button>
                    <Button size="lg" onClick={() => setAdding(true)} disabled={deleteLocked || adding}>
                        <Plus aria-hidden="true" /> Add variable
                    </Button>
                </div>
            </div>

            {deleteLocked ? (
                <div className="rounded-xl border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">Changes are paused while the app is being deleted.</div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                <table className="w-full min-w-[640px] text-sm">
                    <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <th className="w-[30%] px-5 py-3">Name</th>
                            <th className="px-3 py-3">Value</th>
                            <th className="w-[200px] px-3 py-3">Used in</th>
                            <th className="w-16 px-3 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {adding ? (
                            <tr className="border-b bg-primary/[0.03]">
                                <td className="px-5 py-3">
                                    <Input aria-label="New variable name" autoFocus value={draftKey} onChange={(e) => setDraftKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="DATABASE_URL" className="h-9 font-mono text-xs" />
                                </td>
                                <td className="px-3 py-3">
                                    <Input aria-label="New variable value" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} placeholder="postgres://user:pass@host:5432/db" className="h-9 font-mono text-xs" onKeyDown={(e) => { if (e.key === "Enter") addDraft(); }} />
                                </td>
                                <td className="px-3 py-3">
                                    <Select value={draftScope} onValueChange={(v) => setDraftScope(v as Scope)}>
                                        <SelectTrigger aria-label="Used in" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {(["all", "production", "preview", "development"] as Scope[]).map((s) => (
                                                <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="flex justify-end gap-1">
                                        <Button size="sm" onClick={addDraft} disabled={!draftKey.trim()}>Add</Button>
                                        <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={closeAdd}><X aria-hidden="true" /></Button>
                                    </div>
                                </td>
                            </tr>
                        ) : null}

                        {envVars.map((envVar, i) => {
                            const isSecret = envVar.isSecret ?? isSecretKey(envVar.key);
                            const scope = scopeFor(i, envVar.key);
                            const isRevealed = revealed.has(i);
                            const masked = isSecret && !isRevealed;
                            const dots = "•".repeat(Math.max(10, Math.min(envVar.value.length || 18, 22)));
                            return (
                                <tr key={`${envVar.key}-${i}`} className="border-b last:border-b-0 transition-colors hover:bg-muted/30">
                                    <td className="px-5 py-5 font-mono text-[13px] font-semibold text-foreground">{envVar.key}</td>
                                    <td className="px-3 py-5">
                                        <div className="flex items-center gap-3">
                                            {editing === i ? (
                                                <Input aria-label={`Value for ${envVar.key}`} autoFocus value={envVar.value} onChange={(e) => updateValue(i, e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(null); }} className="h-8 font-mono text-xs" />
                                            ) : (
                                                <span className={cn("min-w-0 flex-1 truncate font-mono text-[13px]", masked ? "tracking-widest text-muted-foreground" : "text-foreground")}>{masked ? dots : envVar.value}</span>
                                            )}
                                            <button type="button" aria-label={isRevealed ? `Hide ${envVar.key}` : `Show ${envVar.key}`} onClick={() => toggleReveal(i)} className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                                {masked ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-3 py-5">
                                        <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">{SCOPE_LABEL[scope]}</span>
                                    </td>
                                    <td className="px-3 py-5 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${envVar.key}`}><MoreHorizontal aria-hidden="true" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem disabled={deleteLocked} onSelect={() => setEditing(i)}><Pencil aria-hidden="true" /> Edit value</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => void copyText(envVar.value, "Value")}><Copy aria-hidden="true" /> Copy value</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => void copyText(`${envVar.key}=${envVar.value}`, "KEY=VALUE")}><Copy aria-hidden="true" /> Copy as KEY=VALUE</DropdownMenuItem>
                                                <DropdownMenuItem disabled={deleteLocked} onSelect={() => removeVar(i)} className="text-danger-text focus:text-danger-text"><Trash2 aria-hidden="true" /> Remove</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            );
                        })}

                        {envVars.length === 0 && !adding ? (
                            <tr>
                                <td colSpan={4} className="px-5 py-12 text-center">
                                    <p className="font-semibold text-foreground">No variables yet</p>
                                    <p className="mt-1 text-sm text-muted-foreground">Add one, import a .env file, or connect a database.</p>
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>

            {envVarsChanged ? (
                <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-3.5 shadow-lg">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Info className="size-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{count > 0 ? `${count} ${count === 1 ? "change" : "changes"} not applied yet` : "Changes not applied yet"}</p>
                        <p className="text-sm text-muted-foreground">Your changes will go live after you redeploy.</p>
                    </div>
                    {onDiscard ? <Button variant="outline" disabled={busy} onClick={onDiscard}>Discard</Button> : null}
                    <Button variant="outline" onClick={onSave} disabled={busy || deleteLocked}>
                        {savePending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Save
                    </Button>
                    <Button onClick={handleSaveAndRedeploy} disabled={saveAndRedeployPending || savePending || deployPending || deleteLocked}>
                        {saveAndRedeployPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Rocket aria-hidden="true" />} Save and redeploy
                    </Button>
                </div>
            ) : null}

            {serverId && (
                <QuickDatabaseConnectDialog
                    serverId={serverId}
                    open={connectDialogOpen}
                    onOpenChange={setConnectDialogOpen}
                    existingKeys={new Set(envVars.map((v) => v.key))}
                    onInject={handleDbConnectInject}
                />
            )}
        </section>
    );
}
