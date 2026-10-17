"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, Check, ChevronRight, Clock, Copy, CreditCard, MessageSquare, Mail, Truck, MapPin, Cloud, KeyRound, Bell, Database, Folder, Globe, HardDrive, Info, Loader2, PauseCircle, ShieldCheck, TriangleAlert, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useMigrationActions } from "@/hooks/use-migrations";
import type { MigrationPlan, MigrationView, PlanCheck, PlanItem, ServerSummary } from "@/lib/migration-types";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { formatBytes, formatRange, itemDetail } from "./format";
import { StageRail } from "./stage-rail";

export function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

type GroupId = "apps" | "databases" | "files" | "websites" | "other";

const GROUPS: Array<{ id: GroupId; title: string; hint: string; kinds: PlanItem["kind"][] }> = [
    { id: "apps", title: "Apps", hint: "Docker containers", kinds: ["container"] },
    { id: "databases", title: "Databases", hint: "Your data tables", kinds: ["database"] },
    { id: "files", title: "Files", hint: "Files and storage folders", kinds: ["volume", "bind"] },
    { id: "websites", title: "Websites", hint: "Web addresses and domains", kinds: ["site"] },
    { id: "other", title: "Other things", hint: "Scheduled jobs and services on the server", kinds: ["manual"] },
];

/** Items the owner can see and decide about. Images, networks, empty volumes and system paths are internal. */
function listed(plan: MigrationPlan): PlanItem[] {
    return plan.items.filter((i) => {
        if (!["container", "database", "volume", "bind", "site", "manual"].includes(i.kind)) return false;
        if (i.kind === "volume" && i.method === "create-empty") return false;
        if (i.kind === "bind" && i.disposition === "skip" && !i.needsAck) return false;
        return true;
    });
}

type Status = "moves" | "you" | "cannot" | "left";
function statusOf(i: PlanItem): Status {
    if (i.disposition === "move") return "moves";
    if (i.disposition === "blocked") return "cannot";
    if (i.disposition === "skip") return "left";
    return "you";
}

function GroupIcon({ id, item }: { id: GroupId; item?: PlanItem }) {
    if (id === "apps") return <Brand name="docker" />;
    if (id === "databases") {
        const engine = String(((item?.detail ?? {}) as { engine?: string }).engine ?? "");
        return engine ? <Brand name={engine} /> : <Database className="size-6 text-violet-500" aria-hidden="true" />;
    }
    if (id === "files") return <Folder className="size-6 text-emerald-500" aria-hidden="true" />;
    if (id === "websites") return <Globe className="size-6 text-indigo-500" aria-hidden="true" />;
    return <Wrench className="size-6 text-slate-500" aria-hidden="true" />;
}

function Pill({ status }: { status: Status }) {
    const map: Record<Status, { text: string; cls: string; icon: React.ReactNode }> = {
        moves: { text: "Moves", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: <Check className="size-3.5" aria-hidden="true" /> },
        you: { text: "You do this", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: <TriangleAlert className="size-3.5" aria-hidden="true" /> },
        cannot: { text: "Cannot move", cls: "bg-destructive/10 text-destructive", icon: <XCircle className="size-3.5" aria-hidden="true" /> },
        left: { text: "Left behind", cls: "bg-muted text-muted-foreground", icon: null },
    };
    const m = map[status];
    return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", m.cls)}>{m.icon}{m.text}</span>;
}

function Stat({ icon, tone, label, value, unit }: { icon: React.ReactNode; tone: string; label: string; value: string; unit?: string }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:gap-4 sm:p-4">
            <span className={cn("flex size-11 shrink-0 sm:size-14 items-center justify-center rounded-2xl", tone)}>{icon}</span>
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="flex items-baseline gap-1.5"><span className="text-2xl font-semibold text-foreground">{value}</span>{unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}</p>
            </div>
        </div>
    );
}

function Bar({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? Math.min(100, Math.max(4, Math.round((value / max) * 100))) : 0;
    return <span className="block h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>;
}

const gb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${mb} MB`);

interface Measure { key: string; label: string; old: number | null; neu: number | null; fmt: (n: number) => string; verdict: { ok: boolean; ok_text: string; bad_text: string } | null }

function measures(old: ServerSummary | null, neu: ServerSummary | null, needBytes: number): Measure[] {
    const need = needBytes / 1_000_000;
    return [
        { key: "memory", label: "Memory", old: old?.memoryMb ?? null, neu: neu?.memoryMb ?? null, fmt: gb, verdict: old?.memoryMb && neu?.memoryMb ? { ok: neu.memoryMb >= old.memoryMb * 0.8, ok_text: "Enough room", bad_text: "Smaller" } : null },
        { key: "disk", label: "Free disk", old: old?.diskFreeMb ?? null, neu: neu?.diskFreeMb ?? null, fmt: gb, verdict: neu?.diskFreeMb ? { ok: neu.diskFreeMb >= need, ok_text: "Enough room", bad_text: "Too small" } : null },
        { key: "cpu", label: "Processor", old: old?.cpus ?? null, neu: neu?.cpus ?? null, fmt: (n) => `${n} vCPU`, verdict: old?.cpus && neu?.cpus ? { ok: neu.cpus >= old.cpus, ok_text: "Same or more", bad_text: "Fewer" } : null },
    ];
}

function ServerCheck({ view, plan }: { view: MigrationView; plan: MigrationPlan }) {
    const rows = measures(view.scanSummary.source, view.scanSummary.target, Math.ceil(plan.summary.copyBytes * 1.3) + 2_000_000_000);
    const failing = plan.checks.filter((c) => c.status === "fail");
    const others = plan.checks.filter((c) => c.status !== "fail");
    return (
        <section aria-label="Server check" className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Server check</h2>
            <div className="mt-4 grid grid-cols-[4.5rem_1fr_1fr] items-center gap-x-4 gap-y-4 text-sm sm:grid-cols-[6rem_1fr_1fr]">
                <span />
                <span className="min-w-0"><span className="block truncate font-medium text-foreground">Old server</span><span className="block truncate text-xs text-muted-foreground">{view.source.name}</span></span>
                <span className="min-w-0"><span className="block truncate font-medium text-foreground">New server</span><span className="block truncate text-xs text-muted-foreground">{view.target.name}</span></span>
                {rows.map((m) => {
                    const max = Math.max(m.old ?? 0, m.neu ?? 0);
                    return (
                        <div key={m.key} className="contents">
                            <span className="text-muted-foreground">{m.label}</span>
                            <span className="min-w-0 space-y-1.5">{m.old !== null ? <><Bar value={m.old} max={max} /><span className="block text-xs text-muted-foreground">{m.fmt(m.old)}</span></> : <span className="text-xs text-muted-foreground">Unknown</span>}</span>
                            <span className="min-w-0 space-y-1.5">
                                {m.neu !== null ? (
                                    <>
                                        <Bar value={m.neu} max={max} />
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                            {m.fmt(m.neu)}
                                            {m.verdict ? <span className={cn("rounded-full px-2 py-0.5 font-medium", m.verdict.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>{m.verdict.ok ? m.verdict.ok_text : m.verdict.bad_text}</span> : null}
                                        </span>
                                    </>
                                ) : <span className="text-xs text-muted-foreground">Unknown</span>}
                            </span>
                        </div>
                    );
                })}
            </div>
            {failing.map((c) => <p key={c.id} role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{c.detail}</p>)}
            <details className="group mt-4 border-t border-border/60 pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    All checks ({plan.checks.length})
                </summary>
                <ul className="mt-2 space-y-1.5 pl-6 text-sm">
                    {[...failing, ...others].map((c) => <CheckLine key={c.id} c={c} />)}
                </ul>
            </details>
        </section>
    );
}

function CheckLine({ c }: { c: PlanCheck }) {
    return (
        <li className="flex flex-wrap gap-x-2">
            {c.status === "pass" ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Passed" /> : <TriangleAlert className={cn("mt-0.5 size-3.5 shrink-0", c.status === "fail" ? "text-destructive" : "text-amber-600")} aria-label={c.status === "fail" ? "Fix this first" : "Warning"} />}
            <span className="text-foreground">{c.label}</span>
            <span className="text-muted-foreground">{c.detail}</span>
        </li>
    );
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
    payments: <CreditCard className="size-5" aria-hidden="true" />,
    sms: <MessageSquare className="size-5" aria-hidden="true" />,
    email: <Mail className="size-5" aria-hidden="true" />,
    shipping: <Truck className="size-5" aria-hidden="true" />,
    maps: <MapPin className="size-5" aria-hidden="true" />,
    storage: <Cloud className="size-5" aria-hidden="true" />,
    login: <KeyRound className="size-5" aria-hidden="true" />,
    other: <Bell className="size-5" aria-hidden="true" />,
};

/** What to do before pressing Switch, so the surprises happen while the old server is still serving customers. */
function BeforeYouSwitch({ view, plan }: { view: MigrationView; plan: MigrationPlan }) {
    const { newServerIp, services } = view.readiness;
    const ip = newServerIp ?? view.target.ip;
    const pause = formatRange(plan.estimate.writePauseSec);
    const steps = [
        { when: "A day before", text: "Set the TTL of your domain to 5 minutes in your DNS settings. A low TTL makes your later DNS change spread in minutes, not hours." },
        { when: "Before the switch", text: "Add the new server's IP to every service that limits by IP, and test the checklist below." },
        { when: "Switch time", text: `Pick your quietest hour. Your websites pause for ${pause}.` },
        { when: "Right after Live", text: "Make one small real order on the temporary address. If it fails, press Go back: your data on the new server is kept." },
        { when: "When it works", text: "Change your DNS to the new server, then press Everything works." },
    ];
    return (
        <section aria-label="Before you switch" className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Before you switch</h2>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">New server IP</p>
                        <div className="mt-1.5 flex items-center rounded-lg border border-input bg-muted/30">
                            <span className="min-w-0 flex-1 px-3 py-2.5 font-mono text-sm text-foreground">{ip}</span>
                            <button type="button" aria-label={`Copy ${ip}`} className="border-l border-input px-3 py-2.5 text-muted-foreground hover:text-foreground" onClick={() => void navigator.clipboard.writeText(ip).then(() => toast.success("Copied"))}><Copy className="size-4" aria-hidden="true" /></button>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Add this IP to every service that only accepts listed addresses (payments, SMS, email, shipping). Keep the old IP too, so nothing breaks while you do it.</p>
                    </div>
                    <ol className="space-y-2.5" aria-label="Timeline">
                        {steps.map((st, i) => (
                            <li key={st.when} className="flex gap-3 text-sm">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{i + 1}</span>
                                <span><span className="font-medium text-foreground">{st.when}. </span><span className="text-muted-foreground">{st.text}</span></span>
                            </li>
                        ))}
                    </ol>
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground">Services your project talks to</p>
                    {services.length > 0 ? (
                        <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/60">
                            {services.map((svc, i) => (
                                <li key={svc.id}>
                                    <details className="group" open={i === 0}>
                                        <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{SERVICE_ICON[svc.kind]}</span>
                                            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{svc.name}</span>
                                            <span className="text-xs text-muted-foreground">{svc.checks.length} checks</span>
                                            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                                        </summary>
                                        <ul className="list-disc space-y-1.5 px-3.5 pb-3.5 pl-12 text-sm text-muted-foreground">
                                            {svc.checks.map((c) => <li key={c}>{c}</li>)}
                                        </ul>
                                    </details>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-2 text-sm text-muted-foreground">No known payment, SMS, email or shipping service was found in the settings.</p>}
                    <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Opslin only sees the names of the settings, not their values. A service set inside the app&apos;s code or files will not be listed, and this list cannot tell you whether a provider will accept the new IP.</p>
                </div>
            </div>
        </section>
    );
}

function useCosts(id: string) {
    const key = `smi-costs:${id}`;
    const [costs, setCosts] = useState<{ old: string; neu: string }>({ old: "", neu: "" });
    useEffect(() => {
        try { const raw = window.localStorage.getItem(key); if (raw) setCosts(JSON.parse(raw)); } catch { /* not saved */ }
    }, [key]);
    const set = (next: { old: string; neu: string }) => {
        setCosts(next);
        try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* not saved */ }
    };
    return [costs, set] as const;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function WhatYouGet({ view, plan }: { view: MigrationView; plan: MigrationPlan }) {
    const [costs, setCosts] = useCosts(view.id);
    const oldCost = Number(costs.old);
    const newCost = Number(costs.neu);
    const both = costs.old.trim() !== "" && costs.neu.trim() !== "" && Number.isFinite(oldCost) && Number.isFinite(newCost) && oldCost >= 0 && newCost >= 0;
    const diff = both ? oldCost - newCost : 0;
    return (
        <section aria-label="What you get" className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">What you get</h2>
            <ul className="mt-3 divide-y divide-border/60 text-sm">
                <li className="flex items-center gap-3 py-2.5"><Clock className="size-5 text-primary" aria-hidden="true" /><span className="flex-1 text-muted-foreground">Time to prepare</span><span className="font-medium text-foreground">{formatRange(plan.estimate.prepareSec)}</span></li>
                <li className="flex items-center gap-3 py-2.5"><PauseCircle className="size-5 text-amber-600" aria-hidden="true" /><span className="flex-1 text-muted-foreground">Website pause time</span><span className="font-medium text-foreground">{formatRange(plan.estimate.writePauseSec)}</span></li>
                <li className="flex items-center gap-3 py-2.5"><ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" /><span className="flex-1 text-muted-foreground">Old server stays untouched</span><span className="font-medium text-foreground">until you say so</span></li>
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
                {(["old", "neu"] as const).map((k) => (
                    <label key={k} className="block text-xs text-muted-foreground">
                        {k === "old" ? "Old server cost / month (optional)" : "New server cost / month (optional)"}
                        <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring/40">
                            ₹
                            <input inputMode="numeric" value={costs[k]} onChange={(e) => setCosts({ ...costs, [k]: e.target.value.replace(/[^0-9.]/g, "") })} className="w-full min-w-0 bg-transparent outline-none" aria-label={k === "old" ? "Old server cost per month" : "New server cost per month"} />
                        </span>
                    </label>
                ))}
            </div>
            {both ? (
                <p role="status" className={cn("mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium", diff > 0 ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                    {diff > 0 ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <Info className="size-4 shrink-0" aria-hidden="true" />}
                    {diff > 0 ? `You save ${rupees(diff)} per month` : diff < 0 ? `The new server costs ${rupees(-diff)} more per month` : "The two servers cost the same"}
                </p>
            ) : null}
        </section>
    );
}

function ItemRow({ item, group, view, acked, toggleAck, toggleMove, busy }: {
    item: PlanItem; group: GroupId; view: MigrationView; acked: Set<string>; toggleAck: (k: string, on: boolean) => void; toggleMove: (i: PlanItem, moves: boolean) => void; busy: boolean;
}) {
    const status = statusOf(item);
    const canSwitch = item.kind === "container" && view.actions.canEditPlan && (status === "moves" || status === "left");
    const detail = itemDetail(item);
    const size = item.bytes ? formatBytes(item.bytes) : detail.length < 18 ? detail : "";
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center">{status === "moves" || group !== "other" ? <GroupIcon id={group} item={item} /> : <Wrench className="size-5 text-slate-500" aria-hidden="true" />}</span>
            <span className="min-w-[12rem] flex-1">
                <span className="block break-words text-sm font-medium text-foreground">{item.label}</span>
                {item.reason && status !== "moves" ? <span className="mt-0.5 block text-sm text-muted-foreground">{item.reason}</span> : detail && !size ? <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span> : null}
            </span>
            {size ? <span className="shrink-0 text-sm text-muted-foreground">{size}</span> : null}
            <Pill status={status} />
            {item.needsAck ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={acked.has(item.key)} onCheckedChange={(v) => toggleAck(item.key, v === true)} aria-label={`I understand: ${item.label}`} />
                    I understand
                </label>
            ) : null}
            {canSwitch ? <Switch checked={status === "moves"} onCheckedChange={(on) => toggleMove(item, on)} disabled={busy} aria-label={`Move ${item.label}`} /> : null}
        </li>
    );
}

function Group({ def, items, view, acked, toggleAck, toggleMove, busy, forceOpen }: {
    def: (typeof GROUPS)[number]; items: PlanItem[]; view: MigrationView; acked: Set<string>; toggleAck: (k: string, on: boolean) => void; toggleMove: (i: PlanItem, moves: boolean) => void; busy: boolean; forceOpen: boolean;
}) {
    const count = (s: Status) => items.filter((i) => statusOf(i) === s).length;
    const needsHelp = count("you") + count("left");
    // Open by default only where the answer is: something needs the owner.
    const open = forceOpen || items.some((i) => statusOf(i) === "you" || statusOf(i) === "cannot");
    const engines = def.id === "databases" ? [...new Set(items.map((i) => String(((i.detail ?? {}) as { engine?: string }).engine ?? "")).filter(Boolean))] : [];
    return (
        <details key={String(open)} open={open} className="group rounded-2xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                <span className="flex size-9 shrink-0 items-center justify-center"><GroupIcon id={def.id} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{def.title} <span className="font-normal text-muted-foreground">({items.length})</span></span>
                    <span className="block text-xs text-muted-foreground">{def.hint}</span>
                </span>
                {engines.length > 0 ? <span className="flex items-center gap-2">{engines.map((e) => <Brand key={e} name={e} className="h-6 w-6" />)}</span> : null}
                <span className="flex w-full flex-wrap gap-x-4 text-xs text-muted-foreground sm:w-auto">
                    <span className={count("moves") > 0 ? "text-emerald-700 dark:text-emerald-400" : undefined}>{count("moves")} will move</span>
                    <span className={needsHelp > 0 ? "text-amber-700 dark:text-amber-400" : undefined}>{needsHelp} need your help</span>
                    <span className={count("cannot") > 0 ? "text-destructive" : undefined}>{count("cannot")} cannot move</span>
                </span>
            </summary>
            {items.length > 0 ? (
                <>
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                        {items.map((item) => <ItemRow key={item.key} item={item} group={def.id} view={view} acked={acked} toggleAck={toggleAck} toggleMove={toggleMove} busy={busy} />)}
                    </ul>
                </>
            ) : null}
        </details>
    );
}

/** The plan: what moves, what the owner handles, what cannot move, and what they get. One decision at the bottom. */
export function PlanReview({ view }: { view: MigrationView }) {
    const plan = view.plan;
    const actions = useMigrationActions(view.id);
    const [acked, setAcked] = useState<Set<string>>(new Set());
    const [showSwitches, setShowSwitches] = useState(false);
    const items = useMemo(() => (plan ? listed(plan) : []), [plan]);
    if (!plan) return null;

    const status = (s: Status) => items.filter((i) => statusOf(i) === s).length;
    const needed = plan.needsAck;
    const left = needed.filter((k) => !acked.has(k)).length;
    const pending = actions.confirm.isPending || actions.setSkip.isPending || actions.rescan.isPending;
    const canStart = view.actions.canConfirm && !pending && left === 0;

    const toggleAck = (key: string, on: boolean) => setAcked((prev) => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; });
    const toggleAll = (on: boolean) => setAcked(on ? new Set(plan.needsAck) : new Set());
    const toggleMove = (item: PlanItem, moves: boolean) => {
        const next = moves ? view.skip.filter((k) => k !== item.key) : [...view.skip, item.key];
        actions.setSkip.mutate(next, { onError: (e) => toast.error(errorText(e, "Couldn't change the plan")) });
        setAcked(new Set());
    };
    const start = () =>
        actions.confirm.mutate(
            { planHash: view.planHash ?? "", acknowledged: plan.needsAck, skip: view.skip },
            { onSuccess: () => toast.success("Practice copy started"), onError: (e) => toast.error(errorText(e, "Couldn't start the practice copy")) },
        );

    const notes = [{ title: "Websites will pause", text: `Your websites are offline for ${formatRange(plan.estimate.writePauseSec)} during the final switch.` }];

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-border/70 bg-card"><StageRail stages={view.stages} working={false} /></div>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Here is what will happen</h1>
                <p className="mt-1 text-muted-foreground">We made a simple plan for moving your apps to the new server.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat icon={<Boxes className="size-7 text-emerald-600" aria-hidden="true" />} tone="bg-emerald-500/10" label="Will move" value={String(status("moves"))} unit={status("moves") === 1 ? "item" : "items"} />
                <Stat icon={<TriangleAlert className="size-7 text-amber-600" aria-hidden="true" />} tone="bg-amber-500/10" label="You handle" value={String(status("you") + status("left"))} unit={status("you") + status("left") === 1 ? "item" : "items"} />
                <Stat icon={<XCircle className="size-7 text-destructive" aria-hidden="true" />} tone="bg-destructive/10" label="Cannot move" value={String(status("cannot"))} unit={status("cannot") === 1 ? "item" : "items"} />
                <Stat icon={<HardDrive className="size-7 text-primary" aria-hidden="true" />} tone="bg-primary/10" label="Data to copy" value={formatBytes(plan.summary.copyBytes)} unit="in total" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <WhatYouGet view={view} plan={plan} />
                <ServerCheck view={view} plan={plan} />
            </div>

            <BeforeYouSwitch view={view} plan={plan} />

            <div className="space-y-3">
                {GROUPS.map((def) => {
                    const groupItems = items.filter((i) => def.kinds.includes(i.kind));
                    if (groupItems.length === 0 && def.id === "other") return null;
                    return <Group key={def.id} def={def} items={groupItems} view={view} acked={acked} toggleAck={toggleAck} toggleMove={toggleMove} busy={pending} forceOpen={def.id === "apps" && showSwitches} />;
                })}
            </div>

            <section aria-label="A few things to keep in mind" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><TriangleAlert className="size-4 text-amber-600" aria-hidden="true" />A few things to keep in mind</h2>
                <ul className="mt-3 space-y-2.5 text-sm">
                    {notes.map((n) => <li key={n.title} className="flex flex-wrap gap-x-3"><span className="font-medium text-foreground">{n.title}</span><span className="text-muted-foreground">{n.text}</span></li>)}
                    {plan.risks.map((risk) => <li key={risk} className="text-muted-foreground">{risk}</li>)}
                </ul>
                {plan.estimate.assumptions.length > 0 ? (
                    <details className="group mt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-primary [&::-webkit-details-marker]:hidden">Why these times?<ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" /></summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{plan.estimate.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                    </details>
                ) : null}
            </section>

            <div className="sticky bottom-0 z-30 -mx-4 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                {!plan.ready ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1 text-sm text-muted-foreground">{plan.notReadyReasons.map((r) => <p key={r} className="flex items-center gap-2"><XCircle className="size-4 shrink-0" aria-hidden="true" />{r}</p>)}</div>
                        <Button variant="outline" onClick={() => actions.rescan.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't scan again")) })} disabled={pending}>
                            {actions.rescan.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                            Scan again
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="order-2 flex items-center gap-3 text-sm text-muted-foreground sm:order-1">
                            <Info className="size-4 shrink-0" aria-hidden="true" />
                            {needed.length > 0 ? (
                                <label className="flex cursor-pointer items-center gap-2.5 text-foreground">
                                    <Checkbox checked={left === 0} onCheckedChange={(v) => toggleAll(v === true)} aria-label="I understand all" />
                                    <span>
                                        I understand all {needed.length} <span className="text-muted-foreground">{left > 0 ? `(${left} left to tick)` : "· ticked"}</span>
                                    </span>
                                </label>
                            ) : <span>The old server is only read during the practice copy.</span>}
                        </div>
                        <div className="order-1 flex items-center justify-between gap-4 sm:order-2 sm:justify-end">
                            {view.actions.canEditPlan ? <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowSwitches(true)}>Leave some things behind</button> : null}
                            <Button size="lg" onClick={start} disabled={!canStart}>
                                {actions.confirm.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                                Start practice copy
                                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
