"use client";

import type { LucideIcon } from "lucide-react";
import { Check, ChevronRight, Clock, Copy, Cpu, Fingerprint, Globe, Lock, MoreHorizontal, Network, RefreshCw, Server as ServerIcon, Settings, SquareStack } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Server } from "@/lib/api";
import { cn } from "@/lib/utils";

function Row({ icon: Icon, label, value, copy }: { icon: LucideIcon; label: string; value: string; copy?: boolean }) {
    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        } catch {
            toast.error("Couldn't copy");
        }
    };
    return (
        <li className="flex items-center gap-3 py-2.5 text-sm">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto truncate font-medium text-foreground" title={value}>{value}</span>
            {copy ? (
                <button type="button" aria-label={`Copy ${label}`} onClick={() => void doCopy()} className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <Copy className="size-3.5" aria-hidden="true" />
                </button>
            ) : null}
        </li>
    );
}

export function ServerDetailsCard({ server, onEdit }: { server: Server; onEdit: () => void }) {
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-lg font-semibold text-foreground">Server details</h2>
                <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
            </div>
            <ul className="divide-y px-5 pb-3 pt-2">
                <Row icon={Fingerprint} label="Server ID" value={server.id} copy />
                {server.publicIp ? <Row icon={Globe} label="Public IP" value={server.publicIp} copy /> : null}
                <Row icon={Network} label={server.publicIp ? "Private IP" : "IP address"} value={server.ip || "—"} copy />
                <Row icon={ServerIcon} label="OS" value={server.os || "Linux"} />
                <Row icon={Cpu} label="Architecture" value={server.arch || "—"} />
            </ul>
        </Card>
    );
}

export function AgentCard({
    server,
    isLive,
    connectedAgo,
    updateAvailable,
    latestVersion,
    onManage,
    onUpdate,
}: {
    server: Server;
    isLive: boolean;
    connectedAgo: string;
    updateAvailable: boolean;
    latestVersion?: string;
    onManage: () => void;
    onUpdate: () => void;
}) {
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center gap-2.5 px-5 pt-5">
                <h2 className="text-lg font-semibold text-foreground">Agent</h2>
                <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", isLive ? "bg-success-muted text-success-text" : "bg-danger-muted text-danger-text")}>
                    <span className={cn("size-1.5 rounded-full", isLive ? "bg-success" : "bg-danger")} aria-hidden="true" />
                    {isLive ? "Online" : "Offline"}
                </span>
                <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">v{server.agentVersion || "?"}</span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Agent options">
                            <MoreHorizontal aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={onUpdate}>
                            <RefreshCw aria-hidden="true" /> {updateAvailable ? `Update to v${latestVersion}` : "Check for updates"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onManage}>
                            <Settings aria-hidden="true" /> Manage agent
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <ul className="divide-y px-5 pb-2 pt-2">
                <Row icon={Clock} label="Last connected" value={isLive ? "Just now" : connectedAgo} />
                <Row icon={SquareStack} label="Installed" value={server.createdAt ? new Date(server.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"} />
                <li className="flex items-center gap-3 py-2.5 text-sm">
                    {updateAvailable ? <RefreshCw className="size-4 text-muted-foreground" aria-hidden="true" /> : <Check className="size-4 text-muted-foreground" aria-hidden="true" />}
                    <span className="text-muted-foreground">Version</span>
                    <span className={cn("ml-auto font-medium", updateAvailable ? "text-primary" : "text-success-text")}>{updateAvailable ? `v${latestVersion} available` : "Up to date"}</span>
                </li>
                <li className="flex items-center gap-3 py-2.5 text-sm">
                    <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-muted-foreground">Secure control</span>
                    <span className="ml-auto font-medium text-foreground">{server.secureControl ? "Enabled" : "Not enabled"}</span>
                </li>
            </ul>
            <div className="px-5 pb-5 pt-2">
                <Button variant="outline" className="w-full justify-center" onClick={onManage}>
                    <Settings aria-hidden="true" /> Manage agent
                    <ChevronRight className="ml-auto" aria-hidden="true" />
                </Button>
            </div>
        </Card>
    );
}
