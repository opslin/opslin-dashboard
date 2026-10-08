"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Download, Pause, Play, Search, Activity } from "lucide-react";
import { AppPageSkeleton } from "@/components/apps/AppPageSkeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Server } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

export const LOGS_REFETCH_INTERVAL_MS = 30_000;
const LOG_TAIL_LINE_LIMIT = 200;

type LogsSectionProps = {
    appId: string;
    appName: string;
    server: Pick<Server, "id" | "status" | "isLiveConnected" | "lastSeenAt">;
    active: boolean;
    /** The last captured deploy/build output (app.deployLogs). */
    buildLogs?: string | null;
};

type Level = "INFO" | "WARN" | "ERROR";
type Line = { time: string; level: Level; message: string };

const TIME = /^\[?(\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?|(\d{2}:\d{2}:\d{2}))\]?\s*/;

function parseLine(raw: string): Line {
    let rest = raw.trim();
    let time = "";
    const m = rest.match(TIME);
    if (m) {
        time = m[2] ?? m[3] ?? "";
        rest = rest.slice(m[0].length);
    }
    const lvl = rest.match(/^\[?(INFO|WARN|WARNING|ERROR|ERR|DEBUG|FATAL)\]?[:\s-]*/i);
    let level: Level = /\b(error|fatal|exception|failed)\b/i.test(rest) ? "ERROR" : /\b(warn|warning)\b/i.test(rest) ? "WARN" : "INFO";
    if (lvl) {
        const l = lvl[1].toUpperCase();
        level = l.startsWith("WARN") ? "WARN" : l === "ERROR" || l === "ERR" || l === "FATAL" ? "ERROR" : "INFO";
        rest = rest.slice(lvl[0].length);
    }
    // Strip ANSI colour codes so the text stays readable.
    rest = rest.replace(/\u001b\[[0-9;]*m/g, "");
    return { time, level, message: rest };
}

function tail(logs: string) {
    const lines = logs.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(-LOG_TAIL_LINE_LIMIT).map(parseLine);
}

function agentIsOffline(server: LogsSectionProps["server"]) {
    return server.status === "disconnected" || server.status === "error" || server.isLiveConnected === false;
}

export function LogsSection({ appId, appName, server, active, buildLogs }: LogsSectionProps) {
    const [source, setSource] = useState<"runtime" | "build">("runtime");
    const [query, setQuery] = useState("");
    const [level, setLevel] = useState<"all" | Level>("all");
    const [paused, setPaused] = useState(false);
    const [frozen, setFrozen] = useState<Line[] | null>(null);
    const viewer = useRef<HTMLDivElement>(null);

    const logsQuery = useQuery({
        queryKey: ["appLogs", appId],
        queryFn: () => api.getAppLogs(server.id, appId),
        enabled: active,
        refetchInterval: active && !paused ? LOGS_REFETCH_INTERVAL_MS : false,
    });

    const liveLines = useMemo(() => tail(source === "runtime" ? logsQuery.data?.logs ?? "" : buildLogs ?? ""), [source, logsQuery.data?.logs, buildLogs]);
    const lines = paused && frozen ? frozen : liveLines;
    const q = query.trim().toLowerCase();
    const shown = lines.filter((l) => (level === "all" || l.level === level) && (!q || l.message.toLowerCase().includes(q)));

    useEffect(() => {
        if (!paused && viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
    }, [shown.length, paused, source]);

    if (!active) return <AppPageSkeleton section="logs" />;

    const offline = agentIsOffline(server);
    const live = !paused && source === "runtime" && !offline;

    const download = () => {
        const text = lines.map((l) => `${l.time} ${l.level} ${l.message}`).join("\n");
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `opslin-${appName}-${source}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <section id="deployment-logs" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border bg-muted p-1" role="group" aria-label="Log source">
                    {(["runtime", "build"] as const).map((s) => (
                        <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium capitalize focus-visible:ring-2 focus-visible:ring-ring", source === s ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{s}</button>
                    ))}
                </div>
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input aria-label="Search logs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search logs" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <Select value={level} onValueChange={(v) => setLevel(v as "all" | Level)}>
                    <SelectTrigger aria-label="Log level" className="h-10 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All levels</SelectItem>
                        <SelectItem value="INFO">Info</SelectItem>
                        <SelectItem value="WARN">Warnings</SelectItem>
                        <SelectItem value="ERROR">Errors</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                    {live ? <span className="flex items-center gap-1.5 rounded-full bg-success-muted px-3 py-1 text-xs font-medium text-success-text"><Activity className="size-3.5" aria-hidden="true" />Live</span> : null}
                    <Button variant="outline" onClick={() => { if (!paused) setFrozen(liveLines); setPaused((p) => !p); }}>
                        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />} {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button variant="outline" onClick={download} disabled={lines.length === 0}><Download aria-hidden="true" /> Download</Button>
                </div>
            </div>

            {offline ? (
                <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>The server is offline, so logs may be out of date.{server.lastSeenAt ? ` Last seen ${formatRelativeTime(server.lastSeenAt)}.` : ""}</p>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl bg-foreground text-background shadow-xs">
                <div className="flex items-center justify-between border-b border-background/10 px-5 py-3 font-mono text-xs">
                    <span className="flex items-center gap-2 font-semibold"><span className={cn("size-2 rounded-full", live ? "bg-success" : "bg-background/40")} aria-hidden="true" />{source === "runtime" ? "Runtime output" : "Build output"}<span className="font-normal text-background/50">· {appName}</span></span>
                    <span className="text-background/50">{paused ? "Paused" : "Auto-scroll enabled"}</span>
                </div>
                <div ref={viewer} className="max-h-[520px] min-h-[320px] overflow-auto font-mono text-[13px]" role="log" aria-label={`${source} logs`}>
                    {logsQuery.isLoading && source === "runtime" ? (
                        <p className="px-5 py-10 text-center text-background/60">Loading logs…</p>
                    ) : logsQuery.isError && source === "runtime" ? (
                        <p className="px-5 py-10 text-center text-red-300">Couldn&apos;t load logs. Check that the server is connected and try again.</p>
                    ) : shown.length === 0 ? (
                        <p className="px-5 py-10 text-center text-background/60">{lines.length === 0 ? (source === "runtime" ? "No logs yet. Deploy the app to see output here." : "No build output was saved for the last deploy.") : "No lines match your filters."}</p>
                    ) : (
                        shown.map((l, i) => (
                            <div key={i} className={cn("flex gap-5 border-b border-background/5 px-5 py-2.5 last:border-b-0", l.level === "ERROR" && "bg-red-500/15")}>
                                <span className="w-16 shrink-0 text-background/45">{l.time}</span>
                                <span className={cn("w-12 shrink-0 text-xs font-bold leading-5", l.level === "ERROR" ? "text-red-300" : l.level === "WARN" ? "text-amber-300" : "text-sky-300")}>{l.level}</span>
                                <span className={cn("min-w-0 break-words", l.level === "ERROR" && "text-red-200")}>{l.message}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Showing last {Math.min(lines.length, LOG_TAIL_LINE_LIMIT)} lines · auto-scroll {paused ? "off" : "on"}</span>
                <Button variant="outline" size="sm" onClick={() => { setPaused(false); if (viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight; }}>
                    <ChevronDown aria-hidden="true" /> Jump to latest
                </Button>
            </div>
        </section>
    );
}
