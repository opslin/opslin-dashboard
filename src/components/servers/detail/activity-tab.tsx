"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, ChevronLeft, ChevronRight, Download, Filter, Lock, Rocket, Search, Server as ServerIcon, ShieldCheck, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ActivityEvent } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 8;

const TYPES = [
    { value: "all", label: "All types", match: null },
    { value: "deploy", label: "Deploys", match: ["deploy", "app"] },
    { value: "agent", label: "Agent", match: ["agent"] },
    { value: "security", label: "Security", match: ["firewall", "security", "cloudflare", "harden"] },
    { value: "access", label: "Access", match: ["login", "ssh", "auth", "key"] },
] as const;

const RANGES = [
    { value: "1", label: "Last 24 hours" },
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "0", label: "All time" },
] as const;

function iconFor(event: string): { icon: LucideIcon; tone: string } {
    const e = event.toLowerCase();
    if (/fail|error/.test(e)) return { icon: Rocket, tone: "bg-danger-muted text-danger-text" };
    if (/deploy|app/.test(e)) return { icon: Rocket, tone: "bg-primary/10 text-primary" };
    if (/agent/.test(e)) return { icon: Download, tone: "bg-primary/10 text-primary" };
    if (/firewall|security|cloudflare|harden/.test(e)) return { icon: ShieldCheck, tone: "bg-primary/10 text-primary" };
    if (/login|ssh|auth|key/.test(e)) return { icon: Lock, tone: "bg-primary/10 text-primary" };
    if (/server/.test(e)) return { icon: ServerIcon, tone: "bg-primary/10 text-primary" };
    return { icon: Activity, tone: "bg-muted text-muted-foreground" };
}

function dayKey(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayHeading(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) => dayKey(a.toISOString()) === dayKey(b.toISOString());
    return {
        title: same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long" }),
        date: d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
    };
}

function initials(actor: ActivityEvent["actor"]) {
    const source = actor.name?.trim() || actor.email?.trim() || "";
    return source.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function ActivityTab({ serverId }: { serverId: string }) {
    const [search, setSearch] = useState("");
    const [type, setType] = useState<string>("all");
    const [range, setRange] = useState<string>("7");
    const [page, setPage] = useState(1);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["server-activity", serverId, range],
        queryFn: () =>
            api.getActivity({
                targetType: "server",
                target: serverId,
                limit: 100,
                from: range === "0" ? undefined : new Date(Date.now() - Number(range) * 86_400_000).toISOString(),
            }),
    });

    const filtered = useMemo(() => {
        const match = TYPES.find((t) => t.value === type)?.match;
        const q = search.trim().toLowerCase();
        return (data?.events ?? []).filter((e) => {
            if (match && !match.some((m) => e.event.toLowerCase().includes(m))) return false;
            if (q && !`${e.description} ${e.event}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [data, type, search]);

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const slice = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

    const groups: Array<{ key: string; iso: string; items: ActivityEvent[] }> = [];
    for (const item of slice) {
        const key = dayKey(item.createdAt);
        const last = groups[groups.length - 1];
        if (last?.key === key) last.items.push(item);
        else groups.push({ key, iso: item.createdAt, items: [item] });
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input aria-label="Search activity" placeholder="Search activity" className="h-10 rounded-xl pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
                        <SelectTrigger aria-label="Event type" className="h-10 w-40 gap-2 rounded-xl font-medium"><Filter className="size-4" aria-hidden="true" /><SelectValue /></SelectTrigger>
                        <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
                        <SelectTrigger aria-label="Date range" className="h-10 w-44 gap-2 rounded-xl font-medium"><Calendar className="size-4" aria-hidden="true" /><SelectValue /></SelectTrigger>
                        <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>

            <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                {isLoading ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading activity…</p>
                ) : isError ? (
                    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center text-sm text-muted-foreground">
                        Couldn&apos;t load activity.
                        <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity className="size-5" aria-hidden="true" /></span>
                        <p className="font-semibold text-foreground">No activity found</p>
                        <p className="text-sm text-muted-foreground">Deploys, agent updates and security events for this server appear here.</p>
                    </div>
                ) : (
                    groups.map((group) => {
                        const heading = dayHeading(group.iso);
                        return (
                            <section key={group.key} aria-label={heading.title}>
                                <h3 className="flex items-center gap-3 border-b bg-muted/40 px-5 py-2.5 text-xs">
                                    <span className="font-semibold uppercase tracking-wide text-foreground">{heading.title}</span>
                                    <span className="text-muted-foreground">{heading.date}</span>
                                </h3>
                                <ul className="divide-y">
                                    {group.items.map((item) => {
                                        const { icon: Icon, tone } = iconFor(item.event);
                                        const failed = /fail|error/i.test(item.event);
                                        const system = item.actor.type !== "user" && !item.actor.name;
                                        return (
                                            <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                                                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}><Icon className="size-5" aria-hidden="true" /></span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold text-foreground">{item.description}</p>
                                                    <p className="truncate text-sm text-muted-foreground">{item.event}</p>
                                                </div>
                                                <span className="hidden w-40 items-center gap-2 text-sm text-foreground md:flex">
                                                    {system ? <Activity className="size-4 text-muted-foreground" aria-hidden="true" /> : <Avatar className="size-6"><AvatarFallback className="text-[10px]">{initials(item.actor)}</AvatarFallback></Avatar>}
                                                    <span className="truncate">{system ? "System" : item.actor.name || item.actor.email}</span>
                                                </span>
                                                <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", failed ? "bg-danger-muted text-danger-text" : "bg-success-muted text-success-text")}>
                                                    <span className={cn("size-1.5 rounded-full", failed ? "bg-danger" : "bg-success")} aria-hidden="true" />
                                                    {failed ? "Failed" : "Success"}
                                                </span>
                                                <span className="w-16 text-right text-sm text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })
                )}
                {filtered.length > 0 ? (
                    <div className="flex items-center justify-between border-t px-5 py-3">
                        <p className="text-sm text-muted-foreground">Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length} events</p>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden="true" /> Previous</Button>
                            <span className="px-3 text-sm text-muted-foreground" aria-live="polite">Page {current} of {pages}</span>
                            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next <ChevronRight aria-hidden="true" /></Button>
                        </div>
                    </div>
                ) : null}
            </Card>
        </div>
    );
}
