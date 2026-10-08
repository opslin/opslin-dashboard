"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Cpu, FileText, Folder, Globe, HardDrive, MemoryStick, Network, Package, Plus, RefreshCw, Search, Server, Shield, Terminal, Trash2, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FILTERS, GROUP_LABELS, LIBRARY, commandRisk, type CommandGroup, type LibraryCommand } from "./commands";

const ICONS: Record<string, typeof Terminal> = {
    uptime: Server,
    pwd: Folder,
    ls: FileText,
    whoami: User,
    disk: HardDrive,
    memory: MemoryStick,
    cpu: Cpu,
    "big-folders": HardDrive,
    containers: Package,
    "container-memory": MemoryStick,
    "app-logs": FileText,
    "restart-docker": RefreshCw,
    ports: Network,
    "public-ip": Globe,
    "test-url": Globe,
    "apt-update": Shield,
    "last-logins": User,
    reboot: RefreshCw,
};

export type SavedSnippet = { id: string; title: string; command: string };

export function RiskTag({ risk }: { risk: LibraryCommand["risk"] }) {
    return risk === "read" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success-text">Read-only</span>
    ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning-text">Changes server</span>
    );
}

type CommandLibraryProps = {
    saved: SavedSnippet[];
    disabled: boolean;
    highlight?: boolean;
    firstTime?: boolean;
    onInsert: (command: LibraryCommand) => void;
    onRun: (command: LibraryCommand) => void;
    onAddSnippet: (snippet: { title: string; command: string }) => void;
    onRemoveSnippet: (id: string) => void;
    onClose: () => void;
};

export function CommandLibrary({ saved, disabled, highlight, firstTime, onInsert, onRun, onAddSnippet, onRemoveSnippet, onClose }: CommandLibraryProps) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | CommandGroup>("all");
    const [snippetOpen, setSnippetOpen] = useState(false);
    const [snippetTitle, setSnippetTitle] = useState("");
    const [snippetCommand, setSnippetCommand] = useState("");

    const savedCommands: LibraryCommand[] = useMemo(
        () => saved.map((item) => ({ id: item.id, title: item.title, description: "Your saved command", command: item.command, group: "saved", risk: commandRisk(item.command) })),
        [saved],
    );

    const sections = useMemo(() => {
        const all = [...LIBRARY, ...savedCommands];
        const text = query.trim().toLowerCase();
        const visible = all.filter((item) => {
            if (firstTime && !text && filter === "all") return item.group === "start" || item.id === "disk";
            if (filter !== "all" && item.group !== filter) return false;
            if (!text) return true;
            return `${item.title} ${item.description} ${item.command}`.toLowerCase().includes(text);
        });
        const order: CommandGroup[] = ["start", "health", "apps", "network", "updates", "saved"];
        return order
            .map((group) => ({ group, items: visible.filter((item) => item.group === group) }))
            .filter((section) => section.items.length > 0);
    }, [query, filter, savedCommands, firstTime]);

    const submitSnippet = () => {
        if (!snippetTitle.trim() || !snippetCommand.trim()) return;
        onAddSnippet({ title: snippetTitle.trim(), command: snippetCommand.trim() });
        setSnippetTitle("");
        setSnippetCommand("");
        setSnippetOpen(false);
        setFilter("saved");
    };

    return (
        <aside aria-label="Command library" className={cn("flex max-h-[640px] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-shadow lg:absolute lg:inset-0 lg:max-h-none", highlight && "ring-2 ring-primary")}>
            <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
                <h2 className="text-base font-bold text-foreground">Command library</h2>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setSnippetOpen(true)}><Plus aria-hidden="true" />New snippet</Button>
                    <button type="button" onClick={onClose} aria-label="Close command library" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
                </div>
            </div>

            <div className="space-y-3 border-b px-5 py-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, e.g. disk, logs, restart" aria-label="Search commands" className="h-10 pl-9" />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Command categories">
                    {FILTERS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={filter === item.id}
                            onClick={() => setFilter(item.id)}
                            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring", filter === item.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:text-foreground")}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {sections.length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                        <BookOpen className="mx-auto mb-2 size-6" aria-hidden="true" />
                        {filter === "saved" ? "You have no saved commands yet. Use New snippet to keep one." : "No commands match that search."}
                    </div>
                ) : (
                    sections.map((section) => (
                        <section key={section.group} aria-label={GROUP_LABELS[section.group]}>
                            <h3 className="sticky top-0 z-10 flex items-center justify-between bg-muted/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                                {GROUP_LABELS[section.group]}
                                <span>{section.items.length} {section.items.length === 1 ? "command" : "commands"}</span>
                            </h3>
                            <ul className="space-y-3 p-4">
                                {section.items.map((item) => {
                                    const Icon = ICONS[item.id] ?? Terminal;
                                    return (
                                        <li key={item.id} className="rounded-xl border bg-background p-3.5">
                                            <div className="flex items-start gap-3">
                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm font-semibold leading-snug text-foreground">{item.title}</p>
                                                        <RiskTag risk={item.risk} />
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <code className="min-w-0 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground" title={item.command}>{item.command}</code>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {item.group === "saved" ? (
                                                        <button type="button" onClick={() => onRemoveSnippet(item.id)} aria-label={`Remove ${item.title}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-3.5" aria-hidden="true" /></button>
                                                    ) : null}
                                                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => onInsert(item)} aria-label={`Insert ${item.title}`}>Insert</Button>
                                                    <Button size="sm" disabled={disabled} onClick={() => onRun(item)} aria-label={`Run ${item.title}`}>Run</Button>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))
                )}
            </div>

            <p className="flex items-center gap-1.5 border-t px-5 py-3 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden="true" />
                {firstTime ? "All beginner commands are read-only." : "Commands are inserted first. Changes always need approval."}
            </p>

            <Dialog open={snippetOpen} onOpenChange={setSnippetOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>New snippet</DialogTitle>
                        <DialogDescription>Save a command you use often. It stays in this browser.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="snippet-title">Name</Label>
                            <Input id="snippet-title" value={snippetTitle} onChange={(event) => setSnippetTitle(event.target.value)} placeholder="Show my app logs" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="snippet-command">Command</Label>
                            <Input id="snippet-command" value={snippetCommand} onChange={(event) => setSnippetCommand(event.target.value)} placeholder="docker logs --tail 50 api" className="font-mono" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSnippetOpen(false)}>Cancel</Button>
                        <Button onClick={submitSnippet} disabled={!snippetTitle.trim() || !snippetCommand.trim()}>Save snippet</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </aside>
    );
}
