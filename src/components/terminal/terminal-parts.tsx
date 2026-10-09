"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Play, RefreshCw, Plus, Sparkles, ThumbsDown, ThumbsUp, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { commandWarning, type ErrorHelp, type Suggestion } from "./commands";
import { RiskTag } from "./command-library";

/** Floating confirmation for commands that change the server. */
export function RunConfirm({ command, title, onCancel, onConfirm }: { command: string; title: string; onCancel: () => void; onConfirm: () => void }) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        cancelRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);

    return (
        <div role="alertdialog" aria-modal="false" aria-labelledby="run-confirm-title" aria-describedby="run-confirm-body" className="absolute bottom-4 right-4 z-30 w-[min(420px,calc(100%-2rem))] rounded-2xl border bg-background p-5 shadow-xl">
            <h3 id="run-confirm-title" className="flex items-center gap-2 text-base font-bold text-foreground">
                <AlertTriangle className="size-5 text-warning-text" aria-hidden="true" />
                {title}
            </h3>
            <p id="run-confirm-body" className="mt-2 text-sm text-muted-foreground">{commandWarning(command)}</p>
            <code className="mt-3 block overflow-x-auto rounded-lg bg-inverse px-3 py-2.5 font-mono text-xs text-text-inverse">{command}</code>
            <div className="mt-4 flex justify-end gap-2">
                <Button ref={cancelRef} size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={onConfirm}><Play aria-hidden="true" />Run command</Button>
            </div>
        </div>
    );
}

export function ErrorExplainer({ help, onInsert, onDismiss }: { help: ErrorHelp; onInsert: (command: string) => void; onDismiss: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="absolute right-4 top-4 z-20 flex w-[min(340px,calc(100%-2rem))] flex-col items-end gap-2">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-text-inverse backdrop-blur hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring">
                <Sparkles className="size-3.5" aria-hidden="true" />Explain this error
            </button>
            {open ? (
                <div className="w-full rounded-2xl border bg-background p-4 shadow-xl">
                    <div className="flex items-start gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground">{help.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{help.explanation}</p>
                        </div>
                        <button type="button" onClick={onDismiss} aria-label="Dismiss explanation" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                    </div>
                    {help.fix ? (
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => onInsert(help.fix as string)}><Plus aria-hidden="true" />Insert suggested fix</Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

type AskBarProps = {
    disabled: boolean;
    highlight?: boolean;
    onInsert: (command: string) => void;
    onRun: (command: string, title: string, risk: Suggestion["risk"]) => void;
};

export function AskBar({ disabled, highlight, onInsert, onRun }: AskBarProps) {
    const [text, setText] = useState("");
    const [asked, setAsked] = useState("");
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
    const [empty, setEmpty] = useState(false);
    const [copied, setCopied] = useState(false);
    const [rating, setRating] = useState<"up" | "down" | null>(null);

    const submit = async () => {
        const { suggestCommand } = await import("./commands");
        const result = suggestCommand(text);
        setAsked(text.trim());
        setSuggestion(result);
        setEmpty(!result && Boolean(text.trim()));
        setRating(null);
    };

    const close = () => {
        setSuggestion(null);
        setEmpty(false);
    };

    return (
        <div className={cn("relative border-t bg-card px-5 pb-4 pt-3 transition-shadow", highlight && "ring-2 ring-inset ring-primary")}>
            {suggestion || empty ? (
                <div className="absolute bottom-full left-5 right-5 z-20 mb-2 rounded-2xl border bg-background p-4 shadow-xl" role="region" aria-label="Suggested command">
                    <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground">{suggestion ? "Suggested command" : "No match yet"}</p>
                            <p className="truncate text-xs text-muted-foreground">For: {asked}</p>
                        </div>
                        <button type="button" onClick={close} aria-label="Close suggestion" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                    </div>
                    {suggestion ? (
                        <>
                            <code className="mt-3 block overflow-x-auto rounded-xl bg-inverse px-4 py-3 font-mono text-xs text-text-inverse">{suggestion.command}</code>
                            <p className="mt-2.5 text-sm text-muted-foreground">{suggestion.explanation}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <RiskTag risk={suggestion.risk} />
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        aria-label="Copy command"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(suggestion.command);
                                                setCopied(true);
                                                window.setTimeout(() => setCopied(false), 1500);
                                            } catch {
                                                setCopied(false);
                                            }
                                        }}
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                                    </button>
                                    <button type="button" aria-label="Good suggestion" aria-pressed={rating === "up"} onClick={() => setRating("up")} className={cn("rounded-md p-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", rating === "up" ? "text-primary" : "text-muted-foreground")}><ThumbsUp className="size-4" aria-hidden="true" /></button>
                                    <button type="button" aria-label="Bad suggestion" aria-pressed={rating === "down"} onClick={() => setRating("down")} className={cn("rounded-md p-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", rating === "down" ? "text-primary" : "text-muted-foreground")}><ThumbsDown className="size-4" aria-hidden="true" /></button>
                                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => { onInsert(suggestion.command); close(); }}>Insert</Button>
                                    <Button size="sm" disabled={disabled} onClick={() => { onRun(suggestion.command, "Run this command?", suggestion.risk); close(); }}><Play aria-hidden="true" />Run</Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">I could not find a ready command for that. Try other words, like disk, memory, logs or ports, or pick one from the command library.</p>
                    )}
                </div>
            ) : null}
            <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="terminal-ask" className="flex items-center gap-2 text-sm font-semibold text-foreground"><Sparkles className="size-4 text-primary" aria-hidden="true" />Describe what you want</label>
                <span className="text-xs text-muted-foreground">Suggests commands; you choose what runs.</span>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex items-center gap-2 rounded-xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
                <input
                    id="terminal-ask"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Describe what you want, e.g. show the last 50 lines of my app logs"
                    autoComplete="off"
                    className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button type="submit" size="icon-sm" aria-label="Ask for a command" disabled={!text.trim()}>
                    <Sparkles aria-hidden="true" />
                </Button>
            </form>
        </div>
    );
}

export function ConnectionBanner({ state, retryIn, onRetry }: { state: "reconnecting" | "disconnected" | "error"; retryIn?: number; onRetry: () => void }) {
    const reconnecting = state === "reconnecting";
    return (
        <div role="status" className={cn("absolute inset-x-4 top-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur", reconnecting ? "border-warning bg-background text-foreground" : "border-border bg-background text-foreground")}>
            {reconnecting ? <Loader2 className="size-4 shrink-0 animate-spin text-warning-text" aria-hidden="true" /> : <Unplug className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
                <p className="font-semibold">{reconnecting ? "Reconnecting" : "Session ended"}</p>
                <p className="text-xs text-muted-foreground">
                    {reconnecting ? `Connection dropped. Retrying in ${retryIn ?? 0}s. Your server keeps running.` : "Your server is still running. Start a new session to continue."}
                </p>
            </div>
            <Button size="sm" variant={reconnecting ? "outline" : "default"} onClick={onRetry}>
                <RefreshCw aria-hidden="true" />{reconnecting ? "Retry now" : "Start new session"}
            </Button>
        </div>
    );
}

export function ConnectingOverlay({ serverName }: { serverName: string }) {
    return (
        <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-inverse/80 backdrop-blur-[2px]">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-text-inverse">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <div>
                    <p className="font-semibold">Opening a secure shell</p>
                    <p className="text-xs text-text-on-inverse-muted">Connecting to {serverName}...</p>
                </div>
            </div>
        </div>
    );
}

export function OfflineState({ serverId, serverName, noServers, onReconnect }: { serverId?: string; serverName?: string; noServers: boolean; onReconnect: () => void }) {
    return (
        <div className="flex h-full min-h-[420px] items-center justify-center bg-inverse p-6">
            <div className="max-w-sm text-center">
                <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger"><Unplug className="size-7" aria-hidden="true" /></span>
                {noServers ? (
                    <>
                        <h2 className="text-base font-semibold text-text-inverse">No servers connected</h2>
                        <p className="mt-1.5 text-sm text-text-on-inverse-muted">Connect a server first. The terminal opens a secure shell on it.</p>
                        <div className="mt-5 flex justify-center">
                            <Button asChild><Link href="/servers/connect">Connect a server</Link></Button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="text-base font-semibold text-text-inverse">{serverName ?? "This server"} isn&apos;t reachable</h2>
                        <p className="mt-1.5 text-sm text-text-on-inverse-muted">The Opslin agent stopped responding, so we can&apos;t open a shell.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            <Button onClick={onReconnect}><RefreshCw aria-hidden="true" />Reconnect</Button>
                            <Button asChild variant="secondary"><Link href={`/servers/${serverId}`}>Show how to fix</Link></Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
