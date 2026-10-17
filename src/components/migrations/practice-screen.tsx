"use client";

import Link from "next/link";
import { Activity as Pulse, ArrowRight, Box, Check, ClipboardCheck, Database, FileText, Globe, Info, PauseCircle, Rocket, RotateCcw, Timer, Power, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { useMigrationActions } from "@/hooks/use-migrations";
import type { MigrationStage, MigrationView, PlanCheck } from "@/lib/migration-types";
import { cn } from "@/lib/utils";
import { formatBytes, formatRange, pauseLine } from "./format";
import { Activity } from "./activity";
import { Busy, Confirm } from "./panels";
import { errorText } from "./plan-review";
import { StageRail } from "./stage-rail";
import { TransferScene, type PacketKind } from "./transfer-scene";

const STALLED_MS = 3 * 60_000;

type GroupState = "done" | "working" | "waiting";
interface StepGroup { id: string; title: string; icon: React.ReactNode; match: (stepId: string) => boolean; kinds: PacketKind[] }

const GROUPS: StepGroup[] = [
    { id: "prepare", title: "Prepare the new server", icon: <Server className="size-5" aria-hidden="true" />, match: (s) => s === "prepare" || s.startsWith("rehearsal:specs"), kinds: ["app"] },
    { id: "images", title: "Copy app images", icon: <Box className="size-5" aria-hidden="true" />, match: (s) => /:copy-(out|in):image:/.test(s), kinds: ["app", "image"] },
    { id: "databases", title: "Copy databases", icon: <Database className="size-5" aria-hidden="true" />, match: (s) => /:copy-(out|in):database:/.test(s) || s === "rehearsal:create-databases", kinds: ["database"] },
    { id: "files", title: "Copy files", icon: <FileText className="size-5" aria-hidden="true" />, match: (s) => /:copy-(out|in):(volume|bind):/.test(s), kinds: ["file", "image"] },
    { id: "test", title: "Test everything", icon: <ClipboardCheck className="size-5" aria-hidden="true" />, match: (s) => ["rehearsal:create-apps", "rehearsal:start", "rehearsal:check"].includes(s), kinds: ["app"] },
];

function groupStates(view: MigrationView) {
    return GROUPS.map((g) => {
        const steps = view.steps.filter((s) => g.match(s.id));
        const state: GroupState = steps.length === 0 ? "waiting" : steps.some((s) => s.state === "current") ? "working" : steps.every((s) => s.state === "done") ? "done" : steps.some((s) => s.state === "done") ? "working" : "waiting";
        return { ...g, steps, state };
    }).filter((g) => g.steps.length > 0);
}

/** "Copying shop_uploads: 1.2 GB of 3.0 GB", from the transfer that is moving now. */
function liveLine(view: MigrationView): string | null {
    const t = view.transfers.filter((x) => x.phase === "rehearsal" && (x.status === "uploading" || x.status === "uploaded" || x.status === "pending")).slice(-1)[0];
    const current = view.steps.find((s) => s.state === "current");
    if (!current) return null;
    if (t && t.bytes > 0) {
        const name = t.itemKey === "specs" ? "how your containers are set up" : view.plan?.items.find((i) => i.key === t.itemKey)?.label ?? t.itemKey.replace(/^[a-z]+:/, "");
        return `${current.label}: ${formatBytes(t.bytes)}${t.bytesHint ? ` of ${formatBytes(t.bytesHint)}` : ""} (${name})`;
    }
    return current.label;
}

function Mark({ state }: { state: GroupState }) {
    if (state === "done") return <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-3.5" aria-hidden="true" /></span>;
    if (state === "working") return <span className="relative flex size-6 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full bg-primary/30 motion-reduce:animate-none" /><span className="size-6 rounded-full border-[3px] border-primary bg-background" /></span>;
    return <span className="size-6 rounded-full border-2 border-border bg-background" />;
}

/** Practice copy and practice-copy-ready share the five-step bar; "ready" shows the practice as done and switch as next. */
function railFor(view: MigrationView): MigrationStage[] {
    if (view.status !== "READY_FOR_CUTOVER") return view.stages;
    return view.stages.map((s) => (s.id === "practice" ? { ...s, state: "done" } : s.id === "switch" ? { ...s, state: "current" } : s));
}

/** Why the data is copied twice, said where the owner is looking, so the second copy is not mistaken for a mistake. */
function WhyTwice({ stage }: { stage: "practice" | "ready" | "switch" }) {
    const text =
        stage === "practice"
            ? { title: "This is a practice copy", body: "Your shop is still running, so new orders keep arriving on the old server and this copy gets out of date. It proves the move works. The newest data is copied once more during the switch." }
            : stage === "ready"
              ? { title: "The data will be copied once more", body: "The practice copy is now a little out of date. When you switch, your old apps stop first, then the newest data is copied, so not a single new order is lost. Apps are not copied again; only the data." }
              : { title: "This is the second and final copy", body: "Your old apps are stopped, so nothing new can arrive. The newest data is copied now, into the real place on the new server. The practice copy was only a test and has been cleared." };
    return (
        <aside aria-label="Why the data is copied twice" className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 text-sm">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="font-medium text-foreground">{text.title}</p><p className="mt-0.5 text-muted-foreground">{text.body}</p></div>
        </aside>
    );
}

function SafeBanner({ name }: { name: string }) {
    return (
        <p role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
            Your old server ({name}) is still serving customers. Nothing is changed there.
        </p>
    );
}

function Header({ view, title, subtitle, working }: { view: MigrationView; title: string; subtitle: string; working: boolean }) {
    return (
        <>
            <div className="rounded-2xl border border-border/70 bg-card"><StageRail stages={railFor(view)} working={working} /></div>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
                <p className="mt-1 text-muted-foreground">{subtitle}</p>
            </div>
        </>
    );
}

export function PracticeScreen({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const groups = groupStates(view);
    const working = groups.find((g) => g.state === "working");
    const pct = Math.max(0, Math.min(100, view.progress.percent));
    const est = view.plan?.estimate.prepareSec;
    const leftSec = est ? ((est.min + est.max) / 2) * (1 - pct / 100) : null;
    const stalled = view.actions.canResume && Date.now() - new Date(view.updatedAt).getTime() > STALLED_MS;
    const line = liveLine(view);

    return (
        <div className="flex flex-col gap-6">
            <Header view={view} title="We are making a practice copy" subtitle="Your website keeps running while we test the move." working />
            <div className="rounded-2xl border border-border/70 bg-card px-4 pb-4 pt-2">
                <TransferScene mode="moving" kinds={working?.kinds ?? []} sourceName={view.source.name} targetName={view.target.name} />
            </div>

            <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
                <div className="flex items-center gap-4">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-base font-semibold text-primary">{pct}%</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    {leftSec !== null && pct < 100 ? `${formatRange({ min: leftSec * 0.6, max: leftSec * 1.4 })} left (an estimate)` : "Almost done"}
                    {view.progress.stepsTotal > 0 ? ` · ${view.progress.stepsDone} of ${view.progress.stepsTotal}` : ""}
                </p>
            </div>

            <WhyTwice stage="practice" />
            <ol className="rounded-2xl border border-border/70 bg-card px-5 py-2" aria-label="Steps">
                {groups.map((g, i) => (
                    <li key={g.id} className="relative flex items-start gap-4 py-3">
                        {i < groups.length - 1 ? <span aria-hidden="true" className={cn("absolute left-[11px] top-9 h-[calc(100%-1.5rem)] w-0.5", g.state === "done" ? "bg-emerald-500" : "bg-border")} /> : null}
                        <Mark state={g.state} />
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", g.state === "done" ? "bg-emerald-500/10 text-emerald-600" : g.state === "working" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{g.icon}</span>
                        <span className="min-w-0 flex-1 pt-0.5">
                            <span className="block text-sm font-medium text-foreground">{i + 1}. {g.title}</span>
                            {g.state === "working" && line ? <span className="block text-sm text-muted-foreground">{line}</span> : null}
                        </span>
                        <span className={cn("pt-0.5 text-sm font-medium", g.state === "done" ? "text-emerald-600" : g.state === "working" ? "text-primary" : "text-muted-foreground")}>
                            {g.state === "done" ? "Done" : g.state === "working" ? "Working" : "Waiting"}
                        </span>
                    </li>
                ))}
            </ol>

            <SafeBanner name={view.source.name} />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                {view.actions.canAbort ? (
                    <Confirm
                        trigger={<Button variant="outline">Cancel and clean up</Button>}
                        title="Cancel this migration?"
                        description={<p>What was created on {view.target.name} for the practice copy is removed. {view.source.name} is not changed.</p>}
                        action="Cancel migration"
                        onConfirm={() => actions.abort.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't cancel")) })}
                    />
                ) : <span />}
                {stalled ? (
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                        Nothing has happened for a few minutes
                        <Button variant="outline" onClick={() => actions.resume.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't continue")) })} disabled={actions.resume.isPending}>
                            <Busy pending={actions.resume.isPending} />Continue
                        </Button>
                    </span>
                ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 bg-card"><Activity events={view.events} /></div>
        </div>
    );
}

interface ResultRow { id: string; title: string; detail: string; icon: React.ReactNode; status: "pass" | "warn" | "fail" }

function worst(list: PlanCheck[]): ResultRow["status"] {
    return list.some((c) => c.status === "fail") ? "fail" : list.some((c) => c.status === "warn") ? "warn" : "pass";
}

/** The practice copy's checks in five rows a person recognizes. Rows with nothing behind them are left out. */
function resultRows(view: MigrationView): ResultRow[] {
    const checks = view.verification.rehearsal ?? [];
    const by = (re: RegExp) => checks.filter((c) => re.test(c.id));
    const apps = by(/^container:/);
    const dbs = by(/^db:/);
    const ports = by(/^(port|site):/);
    const health = by(/^health:/);
    const files = view.transfers.filter((t) => t.phase === "rehearsal" && (t.kind === "volume" || t.kind === "bind"));
    const rows: ResultRow[] = [];
    if (apps.length) rows.push({ id: "apps", title: "Apps started", detail: `${apps.length} container${apps.length === 1 ? "" : "s"} keep running`, icon: <Box className="size-5" aria-hidden="true" />, status: worst(apps) });
    if (dbs.length) rows.push({ id: "db", title: "Databases restored", detail: dbs.map((d) => d.detail).filter(Boolean).slice(0, 2).join(" ") || `${dbs.length} restored`, icon: <Database className="size-5" aria-hidden="true" />, status: worst(dbs) });
    if (files.length) rows.push({ id: "files", title: "Files copied", detail: `${files.length} folder${files.length === 1 ? "" : "s"}, ${formatBytes(files.reduce((n, f) => n + f.bytes, 0))}`, icon: <FileText className="size-5" aria-hidden="true" />, status: files.every((f) => f.status === "done") ? "pass" : "warn" });
    if (ports.length) rows.push({ id: "web", title: "Websites answer", detail: ports.filter((p) => p.status !== "pass").map((p) => p.detail)[0] ?? `${ports.length === 1 ? "It answers" : `${ports.length} addresses answer`} correctly`, icon: <Globe className="size-5" aria-hidden="true" />, status: worst(ports) });
    if (health.length) rows.push({ id: "health", title: "Health checks passed", detail: `${health.length} app${health.length === 1 ? " reports" : "s report"} healthy`, icon: <Pulse className="size-5" aria-hidden="true" />, status: worst(health) });
    const rest = checks.filter((c) => !/^(container|db|port|site|health):/.test(c.id));
    for (const c of rest) rows.push({ id: c.id, title: c.label, detail: c.detail, icon: <ClipboardCheck className="size-5" aria-hidden="true" />, status: c.status });
    return rows;
}

// ---- the switch -----------------------------------------------------------------------------------

const SWITCH_GROUPS: StepGroup[] = [
    { id: "check", title: "Check nothing changed", icon: <ClipboardCheck className="size-5" aria-hidden="true" />, match: (s) => s === "cutover:rescan", kinds: ["app"] },
    { id: "stop", title: "Stop the old apps", icon: <Power className="size-5" aria-hidden="true" />, match: (s) => s === "cutover:fence" || s === "cutover:counts", kinds: ["app"] },
    { id: "copy", title: "Copy the last data", icon: <Database className="size-5" aria-hidden="true" />, match: (s) => /^(cutover:(teardown|prepare-final|create-databases|stop-databases)|final:)/.test(s), kinds: ["database", "file", "image"] },
    { id: "start", title: "Start on the new server", icon: <Rocket className="size-5" aria-hidden="true" />, match: (s) => s === "cutover:activate", kinds: ["app"] },
    { id: "test", title: "Test it", icon: <ShieldCheck className="size-5" aria-hidden="true" />, match: (s) => s === "cutover:check", kinds: ["app"] },
];

function switchStates(view: MigrationView) {
    return SWITCH_GROUPS.map((g) => {
        const steps = view.steps.filter((st) => g.match(st.id));
        const state: GroupState = steps.length === 0 ? "waiting" : steps.some((x) => x.state === "current") ? "working" : steps.every((x) => x.state === "done") ? "done" : steps.some((x) => x.state === "done") ? "working" : "waiting";
        return { ...g, steps, state };
    });
}

/** When the switch began, from the activity log. */
function switchStartedAt(view: MigrationView): string {
    const e = [...view.events].reverse().find((x) => x.message.startsWith("Switching over"));
    return e?.at ?? view.updatedAt;
}

function Elapsed({ since }: { since: string }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, []);
    const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return <span className="font-mono tabular-nums" aria-label={`${Math.floor(sec / 60)} minutes ${sec % 60} seconds`}>{mm}:{ss}</span>;
}

function StepList({ groups, line, rowLabel }: { groups: Array<{ id: string; title: string; icon: React.ReactNode; state: GroupState }>; line: string | null; rowLabel: string }) {
    return (
        <ol className="rounded-2xl border border-border/70 bg-card px-5 py-2" aria-label={rowLabel}>
            {groups.map((g, i) => (
                <li key={g.id} className="relative flex items-start gap-4 py-3">
                    {i < groups.length - 1 ? <span aria-hidden="true" className={cn("absolute left-[11px] top-9 h-[calc(100%-1.5rem)] w-0.5", g.state === "done" ? "bg-emerald-500" : "bg-border")} /> : null}
                    <Mark state={g.state} />
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", g.state === "done" ? "bg-emerald-500/10 text-emerald-600" : g.state === "working" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{g.icon}</span>
                    <span className="min-w-0 flex-1 pt-0.5">
                        <span className="block text-sm font-medium text-foreground">{i + 1}. {g.title}</span>
                        {g.state === "working" && line ? <span className="block text-sm text-muted-foreground">{line}</span> : null}
                    </span>
                    <span className={cn("pt-0.5 text-sm font-medium", g.state === "done" ? "text-emerald-600" : g.state === "working" ? "text-primary" : "text-muted-foreground")}>
                        {g.state === "done" ? "Done" : g.state === "working" ? "Working" : "Waiting"}
                    </span>
                </li>
            ))}
        </ol>
    );
}

/** The switch itself: the old apps are stopped, the last data is copied, the new server starts. The one screen that must be calm and clear. */
export function SwitchScreen({ view }: { view: MigrationView }) {
    const groups = switchStates(view);
    const working = groups.find((g) => g.state === "working");
    const pct = Math.max(0, Math.min(100, view.progress.percent));
    const stopped = view.writerOwner === "none" || view.writerOwner === "target";
    const line = liveLine(view);
    const actions = useMigrationActions(view.id);
    const stalled = view.actions.canResume && Date.now() - new Date(view.updatedAt).getTime() > STALLED_MS;

    return (
        <div className="flex flex-col gap-6">
            <Header view={view} title="We are switching to the new server" subtitle="This takes a few minutes. Keep this page open; it updates by itself." working />
            <p role="status" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3.5 text-sm", stopped ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")}>
                {stopped ? <PauseCircle className="size-5 shrink-0" aria-hidden="true" /> : <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1 font-medium">
                    {stopped ? `Your apps on ${view.source.name} are paused so no new data is written. Please do not switch off either server.` : `Your apps are still running on ${view.source.name}. They stop in a moment.`}
                </span>
                <span className="flex items-center gap-1.5 text-base font-semibold"><Timer className="size-4" aria-hidden="true" /><Elapsed since={switchStartedAt(view)} /></span>
            </p>
            <div className="rounded-2xl border border-border/70 bg-card px-4 pb-4 pt-2">
                <TransferScene mode="moving" kinds={working?.kinds ?? []} sourceName={view.source.name} targetName={view.target.name} />
            </div>
            <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
                <div className="flex items-center gap-4">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-base font-semibold text-primary">{pct}%</span>
                </div>
                {view.progress.stepsTotal > 0 ? <p className="mt-2 text-sm text-muted-foreground">Step {Math.min(view.progress.stepsDone + 1, view.progress.stepsTotal)} of {view.progress.stepsTotal}</p> : null}
            </div>
            <WhyTwice stage="switch" />
            <StepList groups={groups} line={line} rowLabel="Switch steps" />
            <p className="flex items-start gap-2.5 text-sm text-muted-foreground"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />If anything goes wrong before the new server starts, your apps start again on {view.source.name} by themselves.</p>
            {stalled ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    Nothing has happened for a few minutes
                    <Button variant="outline" onClick={() => actions.resume.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't continue")) })} disabled={actions.resume.isPending}><Busy pending={actions.resume.isPending} />Continue</Button>
                </div>
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-card"><Activity events={view.events} /></div>
        </div>
    );
}

/** Moving back, or cancelling: the steps Opslin is taking, one by one, in plain words. */
export function UnwindScreen({ view }: { view: MigrationView }) {
    const back = view.progress.phase === "recover";
    const rows = view.steps.map((st) => ({ id: st.id, title: st.label, icon: st.id.includes("unfence") ? <Rocket className="size-5" aria-hidden="true" /> : <Power className="size-5" aria-hidden="true" />, state: (st.state === "current" ? "working" : st.state === "done" ? "done" : "waiting") as GroupState }));
    const pct = Math.max(0, Math.min(100, view.progress.percent));
    const line = view.progress.message || null;
    return (
        <div className="flex flex-col gap-6">
            <Header view={view} title={back ? `Moving back to ${view.source.name}` : "Cancelling and cleaning up"} subtitle={back ? "Your apps are starting again on the old server." : `What was created on ${view.target.name} is being removed. ${view.source.name} is not changed.`} working />
            <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
                <div className="flex items-center gap-4">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
                    <span className="w-12 text-right text-base font-semibold text-primary">{pct}%</span>
                </div>
            </div>
            {rows.length > 0 ? <StepList groups={rows} line={line} rowLabel="Steps" /> : <p className="text-sm text-muted-foreground">{line}</p>}
            {back ? <p className="text-sm text-muted-foreground">Anything {view.target.name} saved since the switch is not carried back. The copy there is kept until you remove it.</p> : null}
            <div className="rounded-2xl border border-border/70 bg-card"><Activity events={view.events} /></div>
        </div>
    );
}

/** The last question before the switch, in three plain steps and one tick. */
function SwitchDialog({ view, pause, busy, onConfirm }: { view: MigrationView; pause: string | null; busy: boolean; onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    const [understood, setUnderstood] = useState(false);
    const short = pause ? pause.split(",")[0]! : "a few minutes";
    const steps = [
        { icon: <PauseCircle className="size-5" aria-hidden="true" />, tone: "bg-amber-500/10 text-amber-600", title: `Your old apps stop for ${short}`, text: `${view.source.name} stops saving data, so nothing new is written while it copies.` },
        { icon: <Database className="size-5" aria-hidden="true" />, tone: "bg-primary/10 text-primary", title: "We copy the newest data", text: `The final copy of your data is sent to ${view.target.name}.` },
        { icon: <Rocket className="size-5" aria-hidden="true" />, tone: "bg-emerald-500/10 text-emerald-600", title: "The new server starts and is tested", text: "You see the result on the next screen." },
    ];
    return (
        <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setUnderstood(false); }}>
            <AlertDialogTrigger asChild>
                <Button size="lg" className="sm:min-w-48" disabled={!view.actions.canCutover || busy}>
                    <Busy pending={busy} />Switch now<ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl">Ready to switch?</AlertDialogTitle>
                    <AlertDialogDescription className="sr-only">Switching stops your apps on the old server for a short time and starts them on the new server.</AlertDialogDescription>
                </AlertDialogHeader>
                <ol className="space-y-3" aria-label="What happens">
                    {steps.map((st, i) => (
                        <li key={st.title} className="flex items-center gap-3">
                            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", st.tone)}>{st.icon}</span>
                            <span className="min-w-0"><span className="block text-sm font-medium text-foreground">{i + 1}. {st.title}</span><span className="block text-sm text-muted-foreground">{st.text}</span></span>
                        </li>
                    ))}
                </ol>
                <p className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-800 dark:text-emerald-300"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />If anything goes wrong before the new server starts, your apps start again on {view.source.name}.</p>
                <p className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Once the new server is live and saving data, moving back does not bring that new data with it.</p>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                    <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
                    I understand the website pauses for a short time
                </label>
                <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <Button disabled={!understood} onClick={() => { setOpen(false); onConfirm(); }}>Switch now</Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function ReadyScreen({ view }: { view: MigrationView }) {
    const actions = useMigrationActions(view.id);
    const rows = resultRows(view);
    const pause = pauseLine(view);
    const warnings = rows.filter((r) => r.status !== "pass").length;

    return (
        <div className="flex flex-col gap-6">
            <Header view={view} title="Practice copy is ready" subtitle={`We copied everything and tested it. Your website is still running on ${view.source.name}.`} working={false} />
            <div className="rounded-2xl border border-border/70 bg-card px-4 pb-4 pt-2">
                <TransferScene mode="done" kinds={["app", "database", "file", "image"]} sourceName={view.source.name} targetName={view.target.name} />
            </div>

            {view.failure?.message ? (
                <p role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-900 dark:text-amber-200">
                    <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    <span>The last switch didn&apos;t start: {view.failure.message}{view.failure.sourceRestored ? ` Your apps are running on ${view.source.name}.` : ""}</span>
                </p>
            ) : null}

            {rows.length > 0 ? (
                <ol className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-5" aria-label="What the practice copy checked">
                    {rows.map((r, i) => (
                        <li key={r.id} className="flex items-center gap-4 py-3.5">
                            {r.status === "pass" ? <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-4" aria-hidden="true" /></span> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700"><TriangleAlert className="size-4" aria-hidden="true" /></span>}
                            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", r.status === "pass" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-700")}>{r.icon}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-foreground">{i + 1}. {r.title}</span>
                                <span className="block text-sm text-muted-foreground">{r.detail}</span>
                            </span>
                            <span className={cn("text-sm font-medium", r.status === "pass" ? "text-emerald-600" : "text-amber-700 dark:text-amber-500")}>{r.status === "pass" ? "Passed" : "Look at this"}</span>
                        </li>
                    ))}
                </ol>
            ) : null}
            <p className="-mt-3 text-sm text-muted-foreground">
                {rows.length > 0 ? (warnings === 0 ? "Every check passed. " : `${warnings} check${warnings === 1 ? "" : "s"} to look at; none stops the switch. `) : ""}
                {pause ? `During the switch your apps pause for ${pause}.` : ""}
            </p>

            <WhyTwice stage="ready" />

            <SafeBanner name={view.source.name} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SwitchDialog view={view} pause={pause} busy={actions.cutover.isPending} onConfirm={() => actions.cutover.mutate(view.planHash ?? "", { onError: (e) => toast.error(errorText(e, "Couldn't start the switch")) })} />
                <Button asChild variant="ghost" className="text-primary"><Link href="/migrations">I will switch later</Link></Button>
                {view.actions.canAbort ? (
                    <span className="sm:ml-auto">
                        <Confirm
                            trigger={<Button variant="ghost" className="text-muted-foreground">Cancel migration</Button>}
                            title="Cancel this migration?"
                            description={<p>The practice copy on {view.target.name} is removed. {view.source.name} is not changed.</p>}
                            action="Cancel migration"
                            onConfirm={() => actions.abort.mutate(undefined, { onError: (e) => toast.error(errorText(e, "Couldn't cancel")) })}
                        />
                    </span>
                ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 bg-card"><Activity events={view.events} /></div>
        </div>
    );
}
