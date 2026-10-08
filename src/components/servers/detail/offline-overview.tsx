"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Copy, Cpu, Database, Globe, Clock, MemoryStick, RotateCw, SquareTerminal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { App, Server } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { INSTALL_COMMANDS } from "../connect/shared";

export function OfflineOverview({ server, apps }: { server: Server; apps: App[] }) {
    const [copied, setCopied] = useState(false);
    const card = useRef<HTMLDivElement>(null);
    const command = INSTALL_COMMANDS.linux;
    const lastSeen = server.lastSeenAt ? formatRelativeTime(server.lastSeenAt) : "a while ago";

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            toast.success("Command copied. Run it on your server.");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Couldn't copy the command");
        }
    };

    const dead = [
        { icon: Cpu, label: "CPU" },
        { icon: MemoryStick, label: "Memory" },
        { icon: Database, label: "Disk" },
        { icon: Clock, label: "Uptime" },
    ];

    return (
        <div className="space-y-4">
            <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-danger/30 bg-danger-muted p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-danger-muted text-danger-text"><TriangleAlert className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{server.name} is offline</p>
                    <p className="text-sm text-danger-text">Monitoring and deploys are paused until the server reconnects.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="dark" onClick={() => void copy()}><RotateCw aria-hidden="true" /> Reconnect</Button>
                    <Button variant="outline" onClick={() => card.current?.scrollIntoView({ behavior: "smooth", block: "center" })}><SquareTerminal aria-hidden="true" /> Show command</Button>
                </div>
            </div>

            <Card ref={card} className="gap-0 rounded-2xl py-0 shadow-xs">
                <div className="flex items-start justify-between px-5 pt-5">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Reconnect in one command</h2>
                        <p className="text-sm text-muted-foreground">Run this on your server to reinstall or restart the Opslin agent.</p>
                    </div>
                    <SquareTerminal className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="px-5 pt-4">
                    <div className="flex items-center gap-3 rounded-xl bg-foreground px-4 py-3.5 text-background">
                        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">{command}</code>
                        <Button size="sm" variant="secondary" onClick={() => void copy()}>
                            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied!" : "Copy"}
                        </Button>
                    </div>
                </div>
                <ol className="flex flex-wrap gap-x-8 gap-y-2 p-5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>Open your provider&apos;s web console or SSH into your server.</li>
                    <li className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>Paste the command and press Enter. Opslin reconnects automatically.</li>
                </ol>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {dead.map((item) => (
                    <Card key={item.label} className="gap-0 rounded-xl py-0 shadow-xs">
                        <div className="space-y-1 px-4 pt-3.5">
                            <p className="flex items-center gap-2 text-sm text-muted-foreground"><item.icon className="size-4" aria-hidden="true" />{item.label}</p>
                            <p className="text-3xl font-bold leading-tight text-foreground">—</p>
                            <p className="text-sm text-muted-foreground">No data while offline</p>
                        </div>
                        <div className="px-4 pb-4 pt-3"><div className="h-1.5 w-full rounded-full bg-muted" role="presentation" /></div>
                    </Card>
                ))}
            </div>

            <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                <div className="flex items-center justify-between px-5 py-3.5">
                    <h2 className="text-lg font-semibold text-foreground">Apps on this server</h2>
                    <span className="text-sm text-muted-foreground">Last known status</span>
                </div>
                <ul className="divide-y border-t">
                    {apps.length === 0 ? <li className="px-5 py-6 text-sm text-muted-foreground">No apps on this server.</li> : null}
                    {apps.map((app) => (
                        <li key={app.id}>
                            <Link href={`/apps/${app.id}`} className="flex items-center gap-4 px-5 py-3.5 opacity-70 transition-colors hover:bg-muted/40 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Globe className="size-4" aria-hidden="true" /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-foreground">{app.name}</p>
                                    <p className="truncate text-sm text-muted-foreground">{app.domain || "No domain yet"}</p>
                                </div>
                                <StatusBadge status={app.status} />
                                <span className="hidden w-32 text-right text-sm text-muted-foreground sm:block">Last seen {lastSeen}</span>
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}
