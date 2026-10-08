"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardPaste, Copy, HelpCircle, Lock, Maximize2, Minimize2, Plus, Search, Server as ServerIcon, Terminal as TerminalIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { CommandLibrary, type SavedSnippet } from "@/components/terminal/command-library";
import { explainError, type ErrorHelp, type LibraryCommand } from "@/components/terminal/commands";
import { GuideSheet } from "@/components/terminal/guide-sheet";
import { AskBar, ConnectingOverlay, ConnectionBanner, ErrorExplainer, OfflineState, RunConfirm } from "@/components/terminal/terminal-parts";
import type { TerminalStatus, XTermTerminalHandle } from "@/components/terminal/xterm-terminal";
import { api } from "@/lib/api";
import type { Server } from "@/lib/api";
import { cn } from "@/lib/utils";

const XTermTerminal = dynamic(
    () => import("@/components/terminal/xterm-terminal").then((mod) => mod.XTermTerminal),
    { ssr: false }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SNIPPETS_KEY = "opslin-terminal-snippets";
const INTRO_KEY = "opslin-terminal-intro";
const FONT_KEY = "opslin-terminal-font";
const MIN_FONT = 11;
const MAX_FONT = 20;

const ANSI = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007]*\u0007/g;

type Session = { id: string; label: string };

const TOUR = [
    { title: "Pick a ready-made command", body: "Choose a safe action from the library." },
    { title: "Or describe what you want", body: "Get a command suggestion in plain English." },
    { title: "See where you're connected", body: "Check your server and session here." },
];

function isServerLive(server: Server | undefined) {
    if (!server) return false;
    if (typeof server.isLiveConnected === "boolean") return server.isLiveConnected;
    return server.status === "connected";
}

function formatTimer(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function readStorage<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function writeStorage(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be blocked; the page still works without it.
    }
}

function TerminalLoader() {
    const params = useSearchParams();
    const requestedServer = params.get("server") ?? params.get("serverId") ?? "";
    const [chosen, setChosen] = useState("");

    const { data: servers = [], refetch } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
        refetchInterval: 30_000,
    });

    const serverId = useMemo(() => {
        if (chosen && servers.some((item) => item.id === chosen)) return chosen;
        if (requestedServer && servers.some((item) => item.id === requestedServer)) return requestedServer;
        return (servers.find(isServerLive) ?? servers[0])?.id ?? "";
    }, [chosen, requestedServer, servers]);
    const live = isServerLive(servers.find((item) => item.id === serverId));

    // A new key gives every server (and every offline-to-online change) a fresh shell.
    return <TerminalWorkspace key={`${serverId}:${live}`} servers={servers} selectedServer={serverId} onSelectServer={setChosen} onRefresh={() => void refetch()} />;
}

function TerminalWorkspace({ servers, selectedServer, onSelectServer, onRefresh }: { servers: Server[]; selectedServer: string; onSelectServer: (id: string) => void; onRefresh: () => void }) {
    const server = servers.find((item) => item.id === selectedServer);
    const serverLive = isServerLive(server);
    const serverName = server ? server.name || server.hostname || server.ip : "";

    const counter = useRef(serverLive ? 1 : 0);
    const [sessions, setSessions] = useState<Session[]>(serverLive ? [{ id: "session-1", label: "Shell 1" }] : []);
    const [activeId, setActiveId] = useState(serverLive ? "session-1" : "");
    const [statuses, setStatuses] = useState<Record<string, TerminalStatus>>({});
    const [connectedAt, setConnectedAt] = useState<Record<string, number>>({});
    const [now, setNow] = useState(() => Date.now());
    const [libraryOpen, setLibraryOpen] = useState(() => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches));
    const [guideOpen, setGuideOpen] = useState(false);
    const [findOpen, setFindOpen] = useState(false);
    const [findTerm, setFindTerm] = useState("");
    const [fontSize, setFontSize] = useState(() => {
        if (typeof window === "undefined") return 14;
        const stored = readStorage<number>(FONT_KEY, 14);
        return stored >= MIN_FONT && stored <= MAX_FONT ? stored : 14;
    });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [saved, setSaved] = useState<SavedSnippet[]>(() => (typeof window === "undefined" ? [] : readStorage<SavedSnippet[]>(SNIPPETS_KEY, [])));
    const [introDismissed, setIntroDismissed] = useState(() => (typeof window === "undefined" ? true : readStorage<boolean>(INTRO_KEY, false)));
    const [tourStep, setTourStep] = useState(() => (typeof window === "undefined" || readStorage<boolean>(INTRO_KEY, false) ? -1 : 0));
    const [confirm, setConfirm] = useState<{ command: string; title: string } | null>(null);
    const [hint, setHint] = useState("");
    const [errorHelp, setErrorHelp] = useState<Record<string, ErrorHelp | null>>({});

    const cardRef = useRef<HTMLDivElement>(null);
    const handles = useRef<Record<string, XTermTerminalHandle | null>>({});
    const buffers = useRef<Record<string, string>>({});
    const hintTimer = useRef<number | undefined>(undefined);

    const newSession = useCallback(() => {
        counter.current += 1;
        const session = { id: `session-${counter.current}`, label: `Shell ${counter.current}` };
        setSessions((prev) => [...prev, session]);
        setActiveId(session.id);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    useEffect(() => {
        if (!activeId) return;
        const frame = window.requestAnimationFrame(() => {
            handles.current[activeId]?.fit();
            handles.current[activeId]?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeId, libraryOpen]);

    const active = handles.current[activeId];
    const status: TerminalStatus = statuses[activeId] ?? { state: "connecting" };
    const connected = status.state === "connected";

    const showHint = useCallback((text: string) => {
        setHint(text);
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(""), 4000);
    }, []);

    const handleStatus = useCallback((id: string, next: TerminalStatus) => {
        setStatuses((prev) => ({ ...prev, [id]: next }));
        if (next.state === "connected") {
            setConnectedAt((prev) => (prev[id] ? prev : { ...prev, [id]: Date.now() }));
        } else if (next.state !== "reconnecting") {
            setConnectedAt((prev) => {
                if (!(id in prev)) return prev;
                const rest = { ...prev };
                delete rest[id];
                return rest;
            });
        }
    }, []);

    const handleOutput = useCallback((id: string, chunk: string) => {
        const text = (buffers.current[id] ?? "") + chunk.replace(ANSI, "");
        buffers.current[id] = text.slice(-1200);
        const help = explainError(text.slice(-400));
        if (help) {
            setErrorHelp((prev) => (prev[id]?.explanation === help.explanation ? prev : { ...prev, [id]: help }));
        }
    }, []);

    const runCommand = useCallback((command: string) => {
        handles.current[activeId]?.sendCommand(command);
        setErrorHelp((prev) => ({ ...prev, [activeId]: null }));
        buffers.current[activeId] = "";
    }, [activeId]);

    const insertCommand = useCallback((command: string) => {
        handles.current[activeId]?.insertText(command);
        showHint("Inserted, not run. Press Enter to run it.");
    }, [activeId, showHint]);

    const requestRun = useCallback((command: string, title: string, risk: "read" | "change") => {
        if (risk === "change") {
            setConfirm({ command, title });
            return;
        }
        runCommand(command);
    }, [runCommand]);

    const closeSession = (id: string) => {
        setSessions((prev) => {
            const next = prev.filter((item) => item.id !== id);
            if (activeId === id) setActiveId(next[next.length - 1]?.id ?? "");
            return next;
        });
    };

    const toggleFullscreen = () => {
        if (!cardRef.current) return;
        if (!document.fullscreenElement) void cardRef.current.requestFullscreen?.();
        else void document.exitFullscreen();
    };

    const changeFont = (delta: number) => {
        setFontSize((prev) => {
            const next = Math.min(MAX_FONT, Math.max(MIN_FONT, prev + delta));
            writeStorage(FONT_KEY, next);
            return next;
        });
    };

    const addSnippet = (snippet: { title: string; command: string }) => {
        setSaved((prev) => {
            const next = [...prev, { id: `saved-${Date.now()}`, ...snippet }];
            writeStorage(SNIPPETS_KEY, next);
            return next;
        });
        toast.success("Snippet saved");
    };

    const removeSnippet = (id: string) => {
        setSaved((prev) => {
            const next = prev.filter((item) => item.id !== id);
            writeStorage(SNIPPETS_KEY, next);
            return next;
        });
    };

    const dismissIntro = () => {
        setIntroDismissed(true);
        setTourStep(-1);
        writeStorage(INTRO_KEY, true);
    };

    const nextTour = () => {
        if (tourStep >= TOUR.length - 1) {
            dismissIntro();
            return;
        }
        setTourStep((step) => step + 1);
    };

    const copySelection = async () => {
        const ok = await active?.copySelection();
        if (ok) toast.success("Copied", { duration: 1500 });
        else toast.info("Select some text in the terminal first");
    };

    const pasteClipboard = async () => {
        const ok = await active?.paste();
        if (!ok) toast.error("Could not paste. Allow clipboard access in your browser.");
    };

    const runFind = (direction: "next" | "previous") => {
        if (findTerm && !active?.find(findTerm, direction)) toast.info("No more matches", { duration: 1500 });
    };

    const elapsed = connectedAt[activeId] ? Math.max(0, Math.floor((now - connectedAt[activeId]) / 1000)) : 0;
    const secure = API_URL.startsWith("https");
    const showWelcome = connected && !introDismissed;
    const activeHelp = errorHelp[activeId] ?? null;

    const pill = !serverLive
        ? { label: "Offline", className: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground" }
        : status.state === "connected"
            ? { label: "Connected", className: "border-success/30 bg-success-muted text-success-text", dot: "bg-success" }
            : status.state === "reconnecting"
              ? { label: "Reconnecting", className: "border-warning/30 bg-warning-muted text-warning-text", dot: "bg-warning" }
              : status.state === "connecting"
                ? { label: "Connecting", className: "border-primary/30 bg-primary/10 text-primary", dot: "bg-primary" }
                : { label: "Disconnected", className: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground" };

    return (
        <div className="dashboard-page">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Terminal</h1>
                {servers.length > 0 ? (
                    <Select value={selectedServer} onValueChange={onSelectServer}>
                        <SelectTrigger aria-label="Server" className="h-10 w-auto gap-2 rounded-lg bg-card px-3 text-sm font-medium">
                            <span className={cn("size-2 rounded-full", serverLive ? "bg-success" : "bg-muted-foreground")} aria-hidden="true" />
                            <SelectValue>{serverName}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {servers.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    {item.name || item.hostname || item.ip} {isServerLive(item) ? "" : "(offline)"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : null}
                {serverLive ? (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", pill.className)}>
                        <span className={cn("size-1.5 rounded-full", pill.dot)} aria-hidden="true" />
                        {pill.label}
                    </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" aria-pressed={libraryOpen} onClick={() => setLibraryOpen((open) => !open)}><BookOpen aria-hidden="true" />Command library</Button>
                    <Button variant="outline" onClick={() => setGuideOpen(true)}><HelpCircle aria-hidden="true" />Guide</Button>
                </div>
            </div>

            <div className={cn("grid items-stretch gap-5", libraryOpen && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
                <div ref={cardRef} className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
                    <div className="flex items-center gap-1 border-b bg-muted/30 px-2" role="tablist" aria-label="Shell sessions">
                        {sessions.map((session) => {
                            const sessionStatus = statuses[session.id]?.state;
                            const isActive = session.id === activeId;
                            return (
                                <div key={session.id} className={cn("relative flex items-center gap-2 px-3 py-3 text-sm", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                    <button type="button" role="tab" aria-selected={isActive} onClick={() => setActiveId(session.id)} className="flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className={cn("size-2 rounded-full", sessionStatus === "connected" ? "bg-success" : sessionStatus === "reconnecting" ? "bg-warning" : "bg-muted-foreground/50")} aria-hidden="true" />
                                        {session.label}
                                    </button>
                                    {sessions.length > 1 ? (
                                        <button type="button" onClick={() => closeSession(session.id)} aria-label={`Close ${session.label}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3" aria-hidden="true" /></button>
                                    ) : null}
                                    {isActive ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                                </div>
                            );
                        })}
                        <button type="button" onClick={newSession} disabled={!serverLive} aria-label="New shell" className="ml-1 rounded-md border bg-background p-1.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /></button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5 text-xs text-muted-foreground">
                        <button type="button" onClick={() => void copySelection()} disabled={!connected} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Copy className="size-3.5" aria-hidden="true" />Copy</button>
                        <button type="button" onClick={() => void pasteClipboard()} disabled={!connected} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><ClipboardPaste className="size-3.5" aria-hidden="true" />Paste</button>
                        <button type="button" onClick={() => active?.clear()} disabled={!connected} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Trash2 className="size-3.5" aria-hidden="true" />Clear</button>
                        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                        <button type="button" aria-pressed={findOpen} onClick={() => { setFindOpen((open) => !open); active?.clearFind(); }} disabled={!serverLive} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Search className="size-3.5" aria-hidden="true" />Find</button>
                        <div className="ml-auto flex items-center gap-1">
                            <button type="button" onClick={() => changeFont(-1)} disabled={fontSize <= MIN_FONT} aria-label="Smaller text" className="rounded-md px-2 py-1.5 font-medium hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">A−</button>
                            <span className="w-10 text-center font-semibold tabular-nums text-foreground">{fontSize}px</span>
                            <button type="button" onClick={() => changeFont(1)} disabled={fontSize >= MAX_FONT} aria-label="Larger text" className="rounded-md px-2 py-1.5 font-medium hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">A+</button>
                            <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                            <button type="button" onClick={toggleFullscreen} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                {isFullscreen ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
                                {isFullscreen ? "Exit full screen" : "Fullscreen"}
                            </button>
                        </div>
                    </div>

                    {findOpen ? (
                        <form
                            onSubmit={(event) => { event.preventDefault(); runFind("next"); }}
                            className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2"
                        >
                            <input autoFocus value={findTerm} onChange={(event) => { setFindTerm(event.target.value); if (event.target.value) active?.find(event.target.value, "next"); }} placeholder="Find in terminal" aria-label="Find in terminal" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                            <Button type="button" size="sm" variant="outline" onClick={() => runFind("previous")}>Previous</Button>
                            <Button type="submit" size="sm" variant="outline">Next</Button>
                            <button type="button" onClick={() => { setFindOpen(false); active?.clearFind(); }} aria-label="Close find" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                        </form>
                    ) : null}

                    <div className="relative h-[clamp(420px,calc(100vh-430px),720px)] bg-inverse">
                        {serverLive && sessions.length > 0 ? (
                            <>
                                {sessions.map((session) => (
                                    <div key={session.id} className={cn("absolute inset-0", session.id === activeId ? "" : "pointer-events-none invisible")} aria-hidden={session.id !== activeId}>
                                        <XTermTerminal
                                            ref={(handle) => { handles.current[session.id] = handle; }}
                                            serverId={selectedServer}
                                            fontSize={fontSize}
                                            onStatusChange={(next) => handleStatus(session.id, next)}
                                            onOutput={(chunk) => handleOutput(session.id, chunk)}
                                        />
                                    </div>
                                ))}
                                {status.state === "connecting" ? <ConnectingOverlay serverName={serverName} /> : null}
                                {status.state === "reconnecting" || status.state === "disconnected" || status.state === "error" ? (
                                    <ConnectionBanner state={status.state} retryIn={status.retryIn} onRetry={() => active?.reconnect()} />
                                ) : null}
                                {activeHelp && connected ? (
                                    <ErrorExplainer help={activeHelp} onInsert={insertCommand} onDismiss={() => setErrorHelp((prev) => ({ ...prev, [activeId]: null }))} />
                                ) : null}
                                {showWelcome ? (
                                    <div className="absolute left-1/2 top-1/2 z-20 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-xl">
                                        <button type="button" onClick={dismissIntro} aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                                        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><TerminalIcon className="size-5" aria-hidden="true" /></span>
                                        <h2 className="mt-4 text-xl font-bold text-foreground">New to the terminal?</h2>
                                        <p className="mt-1.5 text-sm text-muted-foreground">A terminal lets you give your server written instructions. Start with a safe command:</p>
                                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-inverse px-4 py-3">
                                            <code className="font-mono text-sm text-text-inverse">uptime</code>
                                            <Button size="sm" onClick={() => { runCommand("uptime"); dismissIntro(); }}>Try it</Button>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-primary">
                                            <button type="button" className="hover:underline" onClick={() => setGuideOpen(true)}>What is a terminal?</button>
                                            <button type="button" className="hover:underline" onClick={() => setGuideOpen(true)}>Move around folders</button>
                                            <button type="button" className="hover:underline" onClick={() => setGuideOpen(true)}>Stay safe</button>
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                            <button type="button" onClick={dismissIntro} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                                        </div>
                                    </div>
                                ) : null}
                                {confirm ? (
                                    <RunConfirm
                                        command={confirm.command}
                                        title={confirm.title}
                                        onCancel={() => { setConfirm(null); active?.focus(); }}
                                        onConfirm={() => { runCommand(confirm.command); setConfirm(null); }}
                                    />
                                ) : null}
                                {hint ? (
                                    <p role="status" className="absolute bottom-3 left-4 z-10 rounded-md bg-white/10 px-2.5 py-1 font-mono text-xs text-text-on-inverse-muted backdrop-blur"># {hint}</p>
                                ) : null}
                                {showWelcome && tourStep >= 0 ? (
                                    <div className="absolute bottom-4 right-4 z-30 flex w-[min(300px,calc(100%-2rem))] items-start gap-3 rounded-xl border bg-background p-3.5 shadow-xl" role="status">
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{tourStep + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">{TOUR[tourStep].title}</p>
                                            <p className="text-xs text-muted-foreground">{TOUR[tourStep].body}</p>
                                            <div className="mt-2.5 flex items-center justify-end gap-3">
                                                <button type="button" onClick={dismissIntro} className="text-xs text-muted-foreground hover:text-foreground">Skip tour</button>
                                                <Button size="sm" onClick={nextTour}>{tourStep >= TOUR.length - 1 ? "Done" : "Next"}</Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <OfflineState serverId={server?.id} serverName={serverName} noServers={servers.length === 0} onReconnect={onRefresh} />
                        )}
                    </div>

                    <AskBar
                        disabled={!connected}
                        highlight={showWelcome && tourStep === 1}
                        onInsert={insertCommand}
                        onRun={requestRun}
                    />

                    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1 border-t bg-muted/30 px-5 py-2 text-xs text-muted-foreground", showWelcome && tourStep === 2 && "ring-2 ring-inset ring-primary")}>
                        <span className={cn("flex items-center gap-1.5 font-medium", connected ? "text-success-text" : "")}>
                            <span className={cn("size-1.5 rounded-full", connected ? "bg-success" : "bg-muted-foreground/50")} aria-hidden="true" />
                            {pill.label}
                        </span>
                        {server ? (
                            <span className="flex items-center gap-1.5"><ServerIcon className="size-3.5" aria-hidden="true" />{serverName}<span className="font-mono">{server.publicIp || server.ip}</span></span>
                        ) : null}
                        {secure ? <span className="flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden="true" />Encrypted</span> : null}
                        {connected ? <span className="ml-auto flex items-center gap-1.5 tabular-nums">Session {formatTimer(elapsed)}</span> : null}
                    </div>
                </div>

                {libraryOpen ? (
                    <div className="relative lg:min-h-[480px]">
                        <CommandLibrary
                            saved={saved}
                            disabled={!connected}
                            highlight={showWelcome && tourStep === 0}
                            firstTime={showWelcome}
                            onInsert={(item: LibraryCommand) => insertCommand(item.command)}
                            onRun={(item: LibraryCommand) => requestRun(item.command, `${item.title}?`, item.risk)}
                            onAddSnippet={addSnippet}
                            onRemoveSnippet={removeSnippet}
                            onClose={() => setLibraryOpen(false)}
                        />
                    </div>
                ) : null}
            </div>

            <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} onOpenLibrary={() => setLibraryOpen(true)} />
        </div>
    );
}

export default function TerminalPage() {
    return (
        <PlanGate feature="server.terminal" fallback={<div className="p-6"><UpgradePrompt feature="server.terminal" /></div>}>
            <Suspense fallback={null}>
                <TerminalLoader />
            </Suspense>
        </PlanGate>
    );
}
