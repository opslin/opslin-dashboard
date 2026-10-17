"use client";

import { ArrowDown, ArrowRight, Boxes, Check, Database, FileText, Folder, Globe, Info, Loader2, Server, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMigrationActions } from "@/hooks/use-migrations";
import type { MigrationView, ServerSummary } from "@/lib/migration-types";
import { cn } from "@/lib/utils";
import { errorText } from "./plan-review";
import { formatBytes } from "./format";
import { Brand } from "./brand";
import { StageRail } from "./stage-rail";

type Check = { key: string; label: string; icon: React.ReactNode; found: boolean | null; value: string };

function checks(s: ServerSummary | null): Check[] {
    const f = (v: boolean) => (s ? v : null);
    return [
        { key: "docker", label: "Docker", icon: <Brand name="docker" />, found: f(s?.dockerFound ?? false), value: "" },
        { key: "apps", label: "Apps", icon: <Boxes className="size-5 text-primary" aria-hidden="true" />, found: f((s?.apps ?? 0) > 0), value: "" },
        { key: "db", label: "Databases", icon: <Database className="size-5 text-violet-500" aria-hidden="true" />, found: f((s?.databases ?? 0) > 0), value: "" },
        { key: "files", label: "Files", icon: <Folder className="size-5 text-emerald-500" aria-hidden="true" />, found: f((s?.folders ?? 0) > 0), value: "" },
        { key: "sites", label: "Websites", icon: <Globe className="size-5 text-indigo-500" aria-hidden="true" />, found: f((s?.websites ?? 0) > 0), value: "" },
    ];
}

function Counts({ s, bytes }: { s: ServerSummary; bytes: number | null }) {
    const rows: Array<{ key: string; n: string; label: string; icon: React.ReactNode; logos: string[] }> = [
        { key: "apps", n: String(s.apps), label: s.apps === 1 ? "app" : "apps", icon: <Boxes className="size-6 text-primary" aria-hidden="true" />, logos: s.dockerFound && s.apps > 0 ? ["docker"] : [] },
        { key: "db", n: String(s.databases), label: s.databases === 1 ? "database" : "databases", icon: <Database className="size-6 text-violet-500" aria-hidden="true" />, logos: s.engines },
        { key: "files", n: String(s.folders), label: s.folders === 1 ? "storage folder" : "storage folders", icon: <Folder className="size-6 text-emerald-500" aria-hidden="true" />, logos: [] },
        { key: "sites", n: String(s.websites), label: s.websites === 1 ? "website" : "websites", icon: <Globe className="size-6 text-indigo-500" aria-hidden="true" />, logos: s.usesNginx && s.websites > 0 ? ["nginx"] : [] },
    ];
    if (bytes !== null) rows.push({ key: "bytes", n: formatBytes(bytes), label: "to move", icon: <FileText className="size-6 text-slate-500" aria-hidden="true" />, logos: [] });
    return (
        <ul className="divide-y divide-border/60">
            {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-4 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">{r.icon}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-xl font-semibold leading-tight text-foreground">{r.n}</span>
                        <span className="block text-sm text-muted-foreground">{r.label}</span>
                    </span>
                    <span className="flex items-center gap-2.5">{r.logos.map((l) => <Brand key={l} name={l} />)}</span>
                </li>
            ))}
        </ul>
    );
}

function CheckRow({ c }: { c: Check }) {
    return (
        <li className="flex items-center gap-3 py-2 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center">{c.icon}</span>
            <span className="flex-1 text-foreground">{c.label}</span>
            {c.found === null ? (
                <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Looking</span>
            ) : c.found ? (
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><Check className="size-4" aria-hidden="true" />Found</span>
            ) : (
                <span className="text-muted-foreground">{c.key === "docker" ? <span className="text-destructive">Not found</span> : "None"}</span>
            )}
        </li>
    );
}

function Banner({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
    const cls = tone === "good" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : tone === "warn" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-destructive/10 text-destructive";
    return (
        <p role="status" className={cn("mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium", cls)}>
            {tone === "good" ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}
            {children}
        </p>
    );
}

function ServerCard({ role, name, ip, summary, bytes }: { role: "old" | "new"; name: string; ip: string; summary: ServerSummary | null; bytes: number | null }) {
    return (
        <section aria-label={`${role === "old" ? "Old" : "New"} server`} className="min-w-0 rounded-2xl border border-border/70 bg-card p-5">
            <header className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted"><Server className="size-6 text-foreground" aria-hidden="true" /></span>
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{role === "old" ? "Old server" : "New server"}</h2>
                    <p className="truncate text-sm text-muted-foreground">{name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{ip}</p>
                </div>
            </header>
            <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
                {checks(summary).map((c) => <CheckRow key={c.key} c={c} />)}
            </ul>
            {summary ? (
                <div className="border-t border-border/60">
                    <Counts s={summary} bytes={role === "old" ? bytes : null} />
                </div>
            ) : null}
            {role === "new" && summary ? (
                !summary.dockerFound ? <Banner tone="bad">Docker is missing here. Install it first.</Banner>
                : summary.empty ? <Banner tone="good">Empty and ready</Banner>
                : <Banner tone="warn">Already has {summary.apps} app{summary.apps === 1 ? "" : "s"}. Nothing there is overwritten.</Banner>
            ) : null}
        </section>
    );
}

/** The first screen: what is on each server. It stays until the owner chooses to see the plan. */
export function LookScreen({ view, onContinue }: { view: MigrationView; onContinue: () => void }) {
    const actions = useMigrationActions(view.id);
    const done = view.status === "PLANNED";
    const bytes = view.plan?.summary.copyBytes ?? view.scanSummary.source?.bytes ?? null;
    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-border/70 bg-card"><StageRail stages={view.stages} working={!done} /></div>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{done ? "Both servers are checked" : "We are looking at both servers"}</h1>
                <p className="mt-1 text-muted-foreground">We check what is on the old server and what is ready on the new server.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                <ServerCard role="old" name={view.source.name} ip={view.source.ip} summary={view.scanSummary.source} bytes={bytes} />
                <div className="flex justify-center self-center text-muted-foreground" aria-hidden="true">
                    <ArrowRight className="hidden size-6 md:block" />
                    <ArrowDown className="size-6 md:hidden" />
                </div>
                <ServerCard role="new" name={view.target.name} ip={view.target.ip} summary={view.scanSummary.target} bytes={null} />
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden="true" />Nothing is changed on either server while we look.</p>
                <div className="flex items-center gap-4 sm:justify-end">
                    {view.actions.canRescan ? (
                        <Button variant="ghost" className="text-primary" onClick={() => actions.rescan.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't scan again")) })} disabled={actions.rescan.isPending}>
                            Scan again
                        </Button>
                    ) : null}
                    <Button size="lg" className="flex-1 sm:flex-none" disabled={!done} onClick={onContinue}>
                        See my plan
                        <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
