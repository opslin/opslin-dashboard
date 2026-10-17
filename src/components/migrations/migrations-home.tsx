"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ChevronRight, CircleCheck, Copy, ListChecks, Loader2, Lock, Rocket, Search, Server as ServerIcon, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMigrationList, useStartMigration } from "@/hooks/use-migrations";
import { api } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { MigrationListItem } from "@/lib/migration-types";
import { statusLabel, statusTone, type Tone } from "./format";
import { errorText } from "./plan-review";

function Skeleton() {
    return (
        <Panel aria-busy="true" aria-label="Loading migrations">
            <Section>
                <Row label={<SkeletonText className="h-4 w-40" />} />
                <Row label={<SkeletonText className="h-4 w-40" />} />
            </Section>
        </Panel>
    );
}

const STEPS = [
    { icon: Search, title: "Look", text: "We check both servers" },
    { icon: ListChecks, title: "Plan", text: "You review what moves" },
    { icon: Copy, title: "Practice", text: "A safe test copy" },
    { icon: Rocket, title: "Switch", text: "A short pause, then live" },
    { icon: CircleCheck, title: "Live", text: "Your apps run on the new server" },
];

function ServerPick({ role, value, onChange, servers, disabledId }: { role: "from" | "to"; value: string; onChange: (v: string) => void; servers: Array<{ id: string; name: string; ip?: string | null }>; disabledId?: string }) {
    const picked = servers.find((s) => s.id === value);
    const from = role === "from";
    return (
        <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-3">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", from ? "bg-muted text-foreground" : "bg-primary/10 text-primary")}><ServerIcon className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{from ? "Move from" : "Move to"}</p>
                    <p className="text-xs text-muted-foreground">{from ? "The server your apps are on now" : "The server you want them on"}</p>
                </div>
            </div>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="mt-3 w-full" aria-label={from ? "Move from" : "Move to"}><SelectValue placeholder={from ? "Current server" : "New server"} /></SelectTrigger>
                <SelectContent>
                    {servers.map((s) => (
                        <SelectItem key={s.id} value={s.id} disabled={s.id === disabledId}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="mt-2 h-4 font-mono text-xs text-muted-foreground">{picked?.ip ?? ""}</p>
        </div>
    );
}

/** Pick the two servers. This is the whole first screen. */
function StartPanel() {
    const router = useRouter();
    const start = useStartMigration();
    const [sourceId, setSourceId] = useState("");
    const [targetId, setTargetId] = useState("");
    const servers = useQuery({ queryKey: ["servers"], queryFn: () => api.getServers(), retry: false });
    const connected = useMemo(() => (servers.data ?? []).filter((s) => s.status === "connected" && s.isLiveConnected !== false), [servers.data]);

    if (servers.isLoading) {
        return <div className="rounded-2xl border border-border/70 bg-card p-5" aria-busy="true"><SkeletonText className="h-4 w-48" /><SkeletonText className="mt-3 h-4 w-64" /></div>;
    }

    if (connected.length < 2) {
        return (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted"><ServerIcon className="size-6 text-muted-foreground" aria-hidden="true" /></span>
                <div className="min-w-48 flex-1">
                    <p className="text-sm font-semibold text-foreground">{connected.length === 0 ? "Connect two servers to move between them" : "Connect one more server to move between them"}</p>
                    <p className="text-sm text-muted-foreground">{connected.length} connected</p>
                </div>
                <Button asChild><Link href="/servers/connect">Connect a server</Link></Button>
            </div>
        );
    }

    const same = sourceId !== "" && sourceId === targetId;
    const ready = sourceId !== "" && targetId !== "" && !same;
    const go = () =>
        start.mutate(
            { sourceServerId: sourceId, targetServerId: targetId },
            {
                onSuccess: ({ id }) => router.push(`/migrations/${id}`),
                onError: (e) => toast.error(errorText(e, "Couldn't start the migration")),
            },
        );

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <ServerPick role="from" value={sourceId} onChange={setSourceId} servers={connected} />
                <span className="flex justify-center text-muted-foreground" aria-hidden="true"><ArrowRight className="hidden size-6 md:block" /><ArrowDown className="size-6 md:hidden" /></span>
                <ServerPick role="to" value={targetId} onChange={setTargetId} servers={connected} disabledId={sourceId} />
            </div>
            {same ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden="true" />Pick two different servers.</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2.5 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />Opslin looks at both servers first and shows you a plan. Nothing moves until you approve it.</p>
                <Button size="lg" onClick={go} disabled={!ready || start.isPending}>
                    {start.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                    Look at both servers
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}

const PILL: Record<Tone, string> = {
    neutral: "bg-muted text-muted-foreground",
    working: "bg-primary/10 text-primary",
    good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    attention: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
    failed: "bg-destructive/10 text-destructive",
};

type Item = MigrationListItem;

const DONE = new Set(["ACCEPTED", "ABORTED", "ROLLED_BACK", "CUTOVER_DONE"]);

function Names({ m }: { m: Item }) {
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-foreground">
            <span className="truncate">{m.source.name}</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-label="to" />
            <span className="truncate">{m.target.name}</span>
        </span>
    );
}

function StatusPill({ m }: { m: Item }) {
    const tone = statusTone(m.status, m.phase);
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", PILL[tone])}>
            {tone === "working" ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {statusLabel(m.status, m.phase)}
            {tone === "working" && m.percent > 0 ? ` · ${m.percent}%` : ""}
        </span>
    );
}

/** The one that is not finished: the thing to come back to. */
function Current({ m }: { m: Item }) {
    const tone = statusTone(m.status, m.phase);
    const needs = tone === "attention" || tone === "failed";
    return (
        <Link href={`/migrations/${m.id}`} className={cn("block rounded-2xl border p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", needs ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5")}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", needs ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary")}><ServerIcon className="size-5" aria-hidden="true" /></span>
                <span className="min-w-48 flex-1">
                    <span className="block text-xs text-muted-foreground">{needs ? "Needs you" : "In progress"}</span>
                    <Names m={m} />
                </span>
                <StatusPill m={m} />
                <span className="text-xs text-muted-foreground">{formatRelativeTime(m.updatedAt)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open<ChevronRight className="size-4" aria-hidden="true" /></span>
            </div>
            {tone === "working" && m.percent > 0 ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${m.percent}%` }} /></div> : null}
        </Link>
    );
}

function Earlier({ list }: { list: Item[] }) {
    return (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
            {list.map((m) => (
                <li key={m.id}>
                    <Link href={`/migrations/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                        <span className="min-w-48 flex-1"><Names m={m} /></span>
                        <StatusPill m={m} />
                        <span className="w-24 text-right text-xs text-muted-foreground">{formatRelativeTime(m.updatedAt)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export function MigrationsHome() {
    const list = useMigrationList();

    if (list.isLoading) return <Skeleton />;

    if (list.data?.locked) {
        return (
            <Panel>
                <Section>
                    <Row
                        leading={<Lock className="size-4 text-muted-foreground" aria-hidden="true" />}
                        label="Migration isn't turned on for this organization"
                    />
                    <LockedLine>Only Opslin can turn it on during early access.</LockedLine>
                </Section>
            </Panel>
        );
    }

    if (list.error || !list.data) {
        return (
            <Panel>
                <Section>
                    <Row label="Couldn't load your migrations" action={<Button variant="outline" onClick={() => void list.refetch()}>Try again</Button>} />
                </Section>
            </Panel>
        );
    }

    const migrations = list.data.migrations;
    const current = migrations.filter((m) => !DONE.has(m.status));
    const earlier = migrations.filter((m) => DONE.has(m.status));
    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Move your apps to a new server</h1>
                <p className="mt-1 text-muted-foreground">Pick the server your apps are on now, and the one you want them on.</p>
            </header>

            {current.length > 0 ? <section aria-label="In progress" className="space-y-3">{current.map((m) => <Current key={m.id} m={m} />)}</section> : null}

            <section aria-label="Start a migration" className="space-y-4">
                {current.length > 0 ? <h2 className="text-sm font-medium text-muted-foreground">Start another</h2> : null}
                <StartPanel />
            </section>

            <section aria-label="How it works">
                <h2 className="text-sm font-medium text-muted-foreground">How it works</h2>
                <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {STEPS.map((st, i) => (
                        <li key={st.title} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-3.5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><st.icon className="size-4" aria-hidden="true" /></span>
                            <span><span className="block text-sm font-medium text-foreground">{i + 1}. {st.title}</span><span className="block text-xs text-muted-foreground">{st.text}</span></span>
                        </li>
                    ))}
                </ol>
            </section>

            {earlier.length > 0 ? (
                <section aria-label="Earlier migrations" className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">Earlier migrations</h2>
                    <Earlier list={earlier} />
                </section>
            ) : null}
        </div>
    );
}
