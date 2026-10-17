"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Search, Clock, Copy, Database, ExternalLink, Info, KeyRound, Link2, Loader2, Lock, Mail, RotateCcw, Server, ShieldAlert, TriangleAlert, Wallet, Boxes, Cloud, Repeat, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDiagnose, useMigrationActions, useMigrationDomains } from "@/hooks/use-migrations";
import type { DiagnosisCause, MigrationView, MovedApp, PrecheckFinding } from "@/lib/migration-types";
import { cn } from "@/lib/utils";
import { Activity } from "./activity";
import { formatBytes } from "./format";
import { Busy, Confirm } from "./panels";
import { errorText } from "./plan-review";
import { StageRail } from "./stage-rail";

const AVATAR = ["bg-violet-500/15 text-violet-700 dark:text-violet-300", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", "bg-sky-500/15 text-sky-700 dark:text-sky-300", "bg-amber-500/15 text-amber-700 dark:text-amber-300", "bg-rose-500/15 text-rose-700 dark:text-rose-300"];
const avatarOf = (name: string) => AVATAR[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length]!;

/** The icon that says what a finding is about, so a person can scan the list. */
function findingIcon(f: PrecheckFinding) {
    const cls = "size-5";
    if (f.id.startsWith("cookie")) return <Lock className={cls} aria-hidden="true" />;
    if (f.id === "cors" || f.id === "mixed-content") return <ShieldAlert className={cls} aria-hidden="true" />;
    if (f.id === "host-check" || f.id === "old-links" || f.id === "other-hostnames" || f.id === "several-hostnames") return <Globe className={cls} aria-hidden="true" />;
    if (f.id.startsWith("redirect")) return <Repeat className={cls} aria-hidden="true" />;
    if (f.id.startsWith("oauth")) return <KeyRound className={cls} aria-hidden="true" />;
    if (f.id.startsWith("cloudflare")) return <Cloud className={cls} aria-hidden="true" />;
    if (f.id === "baked-address") return <Link2 className={cls} aria-hidden="true" />;
    if (f.id === "mail") return <Mail className={cls} aria-hidden="true" />;
    return f.level === "info" || f.level === "ok" ? <Info className={cls} aria-hidden="true" /> : <TriangleAlert className={cls} aria-hidden="true" />;
}

const LEVEL_TONE: Record<PrecheckFinding["level"], string> = {
    problem: "bg-destructive/10 text-destructive",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    info: "bg-primary/10 text-primary",
    ok: "bg-emerald-500/10 text-emerald-600",
};

function Badge({ app }: { app: MovedApp }) {
    const r = app.precheck;
    if (app.state !== "ready") return null;
    if (!r) return <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking</span>;
    if (!r.reached) return <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive"><TriangleAlert className="size-3.5" aria-hidden="true" />Couldn&apos;t open it</span>;
    const { problems, warnings } = r.summary;
    if (problems === 0 && warnings === 0) return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" aria-hidden="true" />No problems</span>;
    const parts = [];
    if (problems > 0) parts.push(`${problems} problem${problems === 1 ? "" : "s"}`);
    if (warnings > 0) parts.push(`${warnings} note${warnings === 1 ? "" : "s"}`);
    return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", problems > 0 ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}><TriangleAlert className="size-3.5" aria-hidden="true" />{parts.join(", ")}</span>;
}

function Findings({ app }: { app: MovedApp }) {
    const r = app.precheck;
    if (!r) return null;
    const shown = r.findings.filter((f) => f.level !== "ok");
    return (
        <div className="mt-1 rounded-xl border border-border/60 bg-muted/30">
            <ul className="divide-y divide-border/60">
                {shown.map((f) => (
                    <li key={f.id} className="flex gap-3 px-4 py-3.5 text-sm">
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", LEVEL_TONE[f.level])}>{findingIcon(f)}</span>
                        <div className="min-w-0 flex-1 gap-x-6 sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                            <div>
                                <p className="font-medium text-foreground">{f.title}</p>
                                <p className="text-muted-foreground">{f.detail}</p>
                            </div>
                            {f.fix ? <p className="mt-1 text-muted-foreground sm:mt-0"><span className="font-semibold text-foreground">How to fix: </span>{f.fix}</p> : null}
                        </div>
                    </li>
                ))}
                {shown.length === 0 ? <li className="px-4 py-3.5 text-sm text-muted-foreground">Nothing wrong was seen on the home page.</li> : null}
            </ul>
            <details className="group border-t border-border/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                    What this check does not test
                </summary>
                <ul className="list-disc space-y-1 px-4 pb-3 pl-9 text-sm text-muted-foreground">{r.notChecked.map((n) => <li key={n}>{n}</li>)}</ul>
            </details>
        </div>
    );
}

function AppRow({ view, app, defaultOpen }: { view: MigrationView; app: MovedApp; defaultOpen: boolean }) {
    const actions = useMigrationActions(view.id);
    const [open, setOpen] = useState(defaultOpen);
    const hasFindings = app.state === "ready" && !!app.precheck;
    return (
        <li className="py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold", avatarOf(app.label))}>{app.label.charAt(0).toUpperCase()}</span>
                <span className="min-w-32 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                        {app.state === "ready" && app.appId ? <Link href={`/apps/${app.appId}`} className="hover:underline">{app.label}</Link> : app.label}
                    </span>
                    {app.state === "ready" && app.domain ? (
                        <a href={app.url ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground hover:text-foreground">
                            {app.domain}<ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                    ) : app.state === "skipped" ? <span className="block text-xs text-muted-foreground">No temporary address</span>
                    : app.state === "failed" ? <span className="block text-xs text-destructive">Couldn&apos;t create</span> : null}
                </span>
                {hasFindings ? (
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Likely problems for ${app.label}`} className="flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                        <Badge app={app} />
                        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
                    </button>
                ) : <Badge app={app} />}
                {app.state === "ready" && app.url ? (
                    <Button asChild>
                        <a href={app.url} target="_blank" rel="noopener noreferrer">Open site<ExternalLink className="ml-2 size-4" aria-hidden="true" /></a>
                    </Button>
                ) : app.state === "failed" && view.actions.canRetryLinks ? (
                    <Button variant="outline" onClick={() => actions.retryLinks.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't try again")) })} disabled={actions.retryLinks.isPending}>
                        <Busy pending={actions.retryLinks.isPending} />Try again
                    </Button>
                ) : null}
            </div>
            {app.note && app.state === "failed" ? <p className="mt-2 pl-14 text-sm text-destructive" role="alert">{app.note}</p> : null}
            {app.state === "ready" && app.https && app.https.state !== "active" && app.https.reason ? <p className={`mt-2 flex items-start gap-2 pl-14 text-sm ${app.https.state === "blocked" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{app.https.reason}</p> : null}
            {app.state === "ready" && app.https?.state === "active" ? <p className="mt-2 flex items-start gap-2 pl-14 text-sm text-emerald-700 dark:text-emerald-400"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />HTTPS padlock is on for this address.</p> : null}
            {app.note && app.state === "ready" ? <p className="mt-2 flex items-start gap-2 pl-14 text-sm text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{app.note}</p> : null}
            {app.note && app.state === "skipped" ? <p className="mt-2 flex items-start gap-2 pl-14 text-sm text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{app.note}</p> : null}
            {hasFindings && open ? (
                <div className="mt-2 sm:pl-14">
                    <Findings app={app} />
                    {view.actions.canCheckLinks ? (
                        <Button variant="ghost" size="sm" className="mt-1 text-primary" onClick={() => actions.checkLinks.mutate(app.key, { onError: (e) => toast.error(errorText(e, "Couldn't check")) })} disabled={actions.checkLinks.isPending}>
                            {actions.checkLinks.isPending && actions.checkLinks.variables === app.key ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}{actions.checkLinks.isPending && actions.checkLinks.variables === app.key ? "Checking…" : "Check again"}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

function CauseCard({ cause }: { cause: DiagnosisCause }) {
    return (
        <li className="px-4 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", cause.level === "likely" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground")}>{cause.level === "likely" ? "Most likely" : "Possible"}</span>
                <p className="font-medium text-foreground">{cause.title}</p>
                <span className="text-xs text-muted-foreground">seen {cause.count} time{cause.count === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-2 text-muted-foreground">{cause.meaning}</p>
            <p className="mt-3 font-medium text-foreground">What to do</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">{cause.fix.map((f) => <li key={f}>{f}</li>)}</ol>
            {cause.example ? (
                <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden"><ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />Technical details</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground">{cause.example}</pre>
                </details>
            ) : null}
        </li>
    );
}

/** "Why isn't it working?": reads the new server's recent errors so a failed payment or SMS is not blamed on the move. */
function WhyNotWorking({ view }: { view: MigrationView }) {
    const diagnose = useDiagnose(view.id);
    const d = diagnose.data;
    return (
        <section aria-label="Something not working?" className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-foreground">Something not working?</h2>
                    <p className="mt-1 text-sm text-muted-foreground">A payment, SMS or email that fails after a move is usually not a copy problem. The new server has a new address, and some services only talk to addresses they know.</p>
                </div>
                <Button variant="outline" onClick={() => diagnose.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't read the new server's messages")) })} disabled={diagnose.isPending}>
                    {diagnose.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Search className="mr-2 size-4" aria-hidden="true" />}
                    {d ? "Look again" : "Find out why"}
                </Button>
            </div>
            {d ? (
                <div className="mt-4 space-y-3">
                    <p role="status" className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-800 dark:text-emerald-300"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{d.reassurance}</p>
                    {d.causes.length === 0 ? (
                        <p className="flex items-start gap-2.5 rounded-xl border border-border/60 px-3.5 py-3 text-sm text-foreground"><Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />No error messages in the last {d.window} on {d.containers} container{d.containers === 1 ? "" : "s"}. If something still fails, try it once more and press Check again.</p>
                    ) : (
                        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">{d.causes.map((c) => <CauseCard key={c.id} cause={c} />)}</ul>
                    )}
                    <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{d.disclaimer}</p>
                </div>
            ) : null}
        </section>
    );
}

function Hero({ accepted, source, target }: { accepted: boolean; source: string; target: string }) {
    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative flex size-24 items-center justify-center" aria-hidden="true">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20 [animation-duration:2.4s] motion-reduce:animate-none" />
                <span className="absolute inset-2 rounded-full bg-emerald-500/15" />
                <span className="relative flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"><Check className="size-9" strokeWidth={3} /></span>
            </div>
            <h1 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{accepted ? "Your project is running on the new server" : "Your project is now running on the new server"}</h1>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-emerald-500/10 px-5 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">
                <Server className="size-4" aria-hidden="true" />
                <span title={source}>Old server: <strong>stopped and safe</strong></span>
                <ArrowRight className="size-4" aria-hidden="true" />
                <span title={target}>New server: <strong>live</strong></span>
            </p>
        </div>
    );
}

const DOMAIN_STATE: Record<string, string> = {
    "new-server": "Points to the new server",
    "current-server": "Still points to the old server",
    elsewhere: "Points somewhere else",
    "no-record": "No address found",
};

function OwnDomain({ view }: { view: MigrationView }) {
    const domains = useMigrationDomains(view.id, true);
    const ip = domains.data?.targetIp || view.target.ip;
    const first = (view.apps ?? []).find((a) => a.state === "ready" && a.appId);
    const httpsNames = (view.plan?.domains ?? []).filter((d) => d.tls && d.movable).flatMap((d) => d.names.slice(0, 1));
    return (
        <section aria-label="Use your own domain" className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Use your own domain</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_minmax(0,18rem)]">
                <ol className="space-y-3 text-sm">
                    {["Go to your DNS settings.", "Point your domain to this new server IP.", "Come back here and add the domain."].map((t, i) => (
                        <li key={t} className="flex items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{i + 1}</span><span className="text-foreground">{t}</span></li>
                    ))}
                </ol>
                <div>
                    <p className="text-xs text-muted-foreground">New server IP</p>
                    <div className="mt-1 flex items-center rounded-lg border border-input bg-muted/30">
                        <span className="min-w-0 flex-1 px-3 py-2.5 font-mono text-sm text-foreground">{ip}</span>
                        <button type="button" aria-label={`Copy ${ip}`} className="border-l border-input px-3 py-2.5 text-muted-foreground hover:text-foreground" onClick={() => void navigator.clipboard.writeText(ip).then(() => toast.success("Copied"))}><Copy className="size-4" aria-hidden="true" /></button>
                    </div>
                    {first ? <Button asChild className="mt-2 w-full"><Link href={`/apps/${first.appId}?section=domains`}>Add my domain</Link></Button> : null}
                </div>
            </div>
            {(domains.data?.domains.length ?? 0) > 0 ? (
                <ul className="mt-4 divide-y divide-border/60 border-t border-border/60 text-sm">
                    {domains.data!.domains.map((d) => (
                        <li key={d.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                            <span className="text-foreground">{d.name}</span>
                            <span className={cn("flex items-center gap-1.5", d.state === "new-server" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{d.state === "new-server" ? <Check className="size-3.5" aria-hidden="true" /> : null}{DOMAIN_STATE[d.state]}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {httpsNames.length > 0 ? (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{httpsNames.join(", ")} used HTTPS on {view.source.name}. {view.target.name} serves {httpsNames.length === 1 ? "it" : "them"} over plain HTTP for now, because Opslin does not set up certificates for moved sites yet.</p>
            ) : null}
        </section>
    );
}

function minutesBetween(a: string, b: string) {
    const ms = Math.max(0, new Date(b).getTime() - new Date(a).getTime());
    const m = Math.max(1, Math.round(ms / 60000));
    return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function useSavedCosts(id: string) {
    const [saved, setSaved] = useState<number | null>(null);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(`smi-costs:${id}`);
            if (!raw) return;
            const { old, neu } = JSON.parse(raw) as { old: string; neu: string };
            if (old?.trim() && neu?.trim() && Number(old) - Number(neu) > 0) setSaved(Number(old) - Number(neu));
        } catch { /* not saved */ }
    }, [id]);
    return saved;
}

function Gained({ view }: { view: MigrationView }) {
    const saved = useSavedCosts(view.id);
    const apps = (view.apps ?? []).filter((a) => a.state === "ready").length;
    const tiles: Array<{ icon: React.ReactNode; tone: string; label: string; value: string }> = [];
    if (view.liveAt) tiles.push({ icon: <Clock className="size-5" aria-hidden="true" />, tone: "bg-emerald-500/10 text-emerald-600", label: "Time taken", value: minutesBetween(view.createdAt, view.liveAt) });
    if (view.plan) tiles.push({ icon: <Database className="size-5" aria-hidden="true" />, tone: "bg-primary/10 text-primary", label: "Data moved", value: formatBytes(view.plan.summary.copyBytes) });
    if (saved !== null) tiles.push({ icon: <Wallet className="size-5" aria-hidden="true" />, tone: "bg-emerald-500/10 text-emerald-600", label: "Money saved", value: `₹${Math.round(saved).toLocaleString("en-IN")} per month` });
    else if (apps > 0) tiles.push({ icon: <Boxes className="size-5" aria-hidden="true" />, tone: "bg-violet-500/10 text-violet-600", label: "Apps with an address", value: String(apps) });
    if (tiles.length === 0) return null;
    return (
        <section aria-label="What you gained" className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">What you gained</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {tiles.map((t) => (
                    <div key={t.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", t.tone)}>{t.icon}</span>
                        <span><span className="block text-xs text-muted-foreground">{t.label}</span><span className="block text-base font-semibold text-foreground">{t.value}</span></span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Live on the new server (and, after Accept, the same page without the two decisions). */
export function LiveScreen({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const accepted = view.status === "ACCEPTED" || view.status === "CUTOVER_DONE";
    const apps = (view.apps ?? []).filter((a) => a.state !== "removed");
    const firstWithFindings = apps.findIndex((a) => a.state === "ready" && (a.precheck?.summary.problems ?? 0) > 0);

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-border/70 bg-card"><StageRail stages={view.stages} working={false} /></div>
            <Hero accepted={accepted} source={view.source.name} target={view.target.name} />

            {apps.length > 0 ? (
                <section aria-label="Your apps" className="rounded-2xl border border-border/70 bg-card p-5">
                    <h2 className="text-base font-semibold text-foreground">Your apps</h2>
                    <ul className="mt-2 divide-y divide-border/60">
                        {apps.map((a, i) => <AppRow key={a.key} view={view} app={a} defaultOpen={i === firstWithFindings} />)}
                    </ul>
                    {apps.some((a) => a.state === "ready") ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden="true" />This is a quick look, not proof that everything works.</p>
                    ) : null}
                </section>
            ) : null}

            <WhyNotWorking view={view} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
                <OwnDomain view={view} />
                <Gained view={view} />
            </div>

            {(view.verification.final ?? []).length > 0 ? (
                <details className="group rounded-2xl border border-border/70 bg-card">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                        What was checked ({view.verification.final!.length})
                    </summary>
                    <ul className="space-y-1.5 px-5 pb-4 text-sm">
                        {view.verification.final!.map((c) => (
                            <li key={c.id} className="flex flex-wrap gap-x-2">
                                {c.status === "pass" ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Passed" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-label="Warning" />}
                                <span className="text-foreground">{c.label}</span><span className="text-muted-foreground">{c.detail}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-card"><Activity events={view.events} /></div>

            {accepted ? (
                <div className="flex flex-wrap items-center gap-3">
                    <Button asChild size="lg"><Link href="/apps">Go to Apps<ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button>
                    <Button asChild variant="ghost" className="text-primary"><Link href="/migrations">Start another migration</Link></Button>
                    <span className="text-sm text-muted-foreground sm:ml-auto">{view.source.name} was left as it is; remove it yourself when you&apos;re ready.</span>
                </div>
            ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button size="lg" onClick={() => actions.accept.mutate(undefined, { onSuccess: () => toast.success("Migration finished"), onError: (e) => toast.error(errorText(e, "Couldn't finish")) })} disabled={!view.actions.canAccept || actions.accept.isPending}>
                        <Busy pending={actions.accept.isPending} />Everything works – finish<ArrowRight className="ml-2 size-4" aria-hidden="true" />
                    </Button>
                    <Confirm
                        trigger={<Button size="lg" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={!view.actions.canRecover || actions.recover.isPending}><Busy pending={actions.recover.isPending} /><RotateCcw className="mr-2 size-4" aria-hidden="true" />Go back to the old server</Button>}
                        title="Move back to the old server?"
                        description={
                            <>
                                <p>Your apps stop on {view.target.name} and start again on {view.source.name}.</p>
                                <p>The copy on {view.target.name} is kept; nothing is deleted there, so you can look at what went wrong. You can remove it later.</p>
                                <p>Anything {view.target.name} saved since the switch is not carried back to {view.source.name}.</p>
                                {(view.apps ?? []).some((a) => a.state === "ready") ? <p>The apps and temporary addresses made for the moved sites are removed.</p> : null}
                            </>
                        }
                        action="Move back"
                        destructive
                        onConfirm={() => actions.recover.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't move back")) })}
                    />
                </div>
            )}
        </div>
    );
}
