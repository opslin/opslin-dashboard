"use client";

import Link from "next/link";
import { ChevronRight, Copy, Database as DatabaseIcon, Globe, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { App, Database, Server } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

function ListCard({ title, count, action, children }: { title: string; count: number; action: { label: string; href: string }; children: React.ReactNode }) {
    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    {title}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
                </h2>
                <Link href={action.href} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    {action.label} <span aria-hidden="true">+</span>
                </Link>
            </div>
            <ul className="divide-y border-t">{children}</ul>
        </Card>
    );
}

function Row({ href, icon: Icon, tone, title, subtitle, status, meta }: { href: string; icon: LucideIcon; tone: string; title: string; subtitle: string; status: string; meta: string }) {
    return (
        <li>
            <Link href={href} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone)}>
                    <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{title}</p>
                    <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
                </div>
                <StatusBadge status={status} />
                <span className="hidden w-32 text-right text-sm text-muted-foreground sm:block">{meta}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
        </li>
    );
}

function Empty({ text }: { text: string }) {
    return <li className="px-5 py-6 text-sm text-muted-foreground">{text}</li>;
}

export function AppsCard({ serverId, apps }: { serverId: string; apps: App[] }) {
    return (
        <ListCard title="Apps" count={apps.length} action={{ label: "Deploy app", href: `/apps/new?server=${serverId}` }}>
            {apps.length === 0 ? <Empty text="No apps yet. Deploy your first one in two steps." /> : null}
            {apps.slice(0, 5).map((app) => (
                <Row
                    key={app.id}
                    href={`/apps/${app.id}`}
                    icon={Globe}
                    tone="bg-primary/10 text-primary"
                    title={app.name}
                    subtitle={app.domain || "No domain yet"}
                    status={app.effectiveStatus ?? app.status}
                    meta={app.deployedAt ? `Deployed ${formatRelativeTime(app.deployedAt)}` : "Not deployed yet"}
                />
            ))}
        </ListCard>
    );
}

export function DatabasesCard({ serverId, databases }: { serverId: string; databases: Database[] }) {
    return (
        <ListCard title="Databases" count={databases.length} action={{ label: "New database", href: `/databases/new?server=${serverId}` }}>
            {databases.length === 0 ? <Empty text="No databases on this server." /> : null}
            {databases.slice(0, 5).map((database) => (
                <Row
                    key={database.id}
                    href={`/databases/${database.id}`}
                    icon={DatabaseIcon}
                    tone="bg-chart-violet/15 text-chart-violet-text"
                    title={database.name}
                    subtitle={`${database.type.replace("_", " ")}${database.port ? ` · port ${database.port}` : ""}`}
                    status={database.status}
                    meta={`Created ${formatRelativeTime(database.createdAt)}`}
                />
            ))}
        </ListCard>
    );
}

function DetailRow({ label, children, copy }: { label: string; children: React.ReactNode; copy?: string }) {
    return (
        <li className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto flex items-center gap-2 font-medium text-foreground">
                {children}
                {copy ? (
                    <button
                        type="button"
                        aria-label={`Copy ${label}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(copy);
                                toast.success(`${label} copied`);
                            } catch {
                                toast.error("Couldn't copy");
                            }
                        }}
                    >
                        <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                ) : null}
            </span>
        </li>
    );
}

export function DetailsCard({ server, updateAvailable, onUpdate }: { server: Server; updateAvailable: boolean; onUpdate: () => void }) {
    const ip = server.publicIp || server.ip;
    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <h2 className="px-5 py-3.5 text-lg font-semibold text-foreground">Details</h2>
            <ul className="divide-y border-t">
                <DetailRow label="IP address" copy={ip}>{ip || "—"}</DetailRow>
                <DetailRow label="Hostname">{server.hostname || "—"}</DetailRow>
                <DetailRow label="OS">{server.os || "Linux"}{server.arch ? ` · ${server.arch}` : ""}</DetailRow>
                <DetailRow label="Agent">
                    v{server.agentVersion || "?"}
                    {updateAvailable ? (
                        <button type="button" onClick={onUpdate} className="rounded-full border border-primary/30 bg-background px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">
                            Update available
                        </button>
                    ) : null}
                </DetailRow>
                <DetailRow label="Connected since">
                    {server.connectedAt ? new Date(server.connectedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                </DetailRow>
            </ul>
        </Card>
    );
}

interface ActivityItem {
    id: string;
    text: string;
    at: string;
    tone: "success" | "info" | "neutral";
}

export function RecentActivityCard({ server, apps, firewallCommits, agentUpdatedAt, onViewAll }: { server: Server; apps: App[]; firewallCommits: Array<{ id: string; status: string; createdAt: string }>; agentUpdatedAt?: string | null; onViewAll: () => void }) {
    const items: ActivityItem[] = [];
    for (const app of apps) if (app.deployedAt) items.push({ id: `app-${app.id}`, text: `${app.name} deployed`, at: app.deployedAt, tone: "info" });
    for (const commit of firewallCommits.slice(0, 3)) items.push({ id: `fw-${commit.id}`, text: commit.status === "active" ? "Firewall enabled" : "Firewall change recorded", at: commit.createdAt, tone: "success" });
    if (agentUpdatedAt) items.push({ id: "agent", text: `Agent updated to v${server.agentVersion || "?"}`, at: agentUpdatedAt, tone: "success" });
    if (server.connectedAt) items.push({ id: "connected", text: "Server connected", at: server.connectedAt, tone: "neutral" });
    const sorted = items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5);
    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 py-3.5">
                <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
                <button type="button" onClick={onViewAll} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    View activity <ChevronRight className="size-4" aria-hidden="true" />
                </button>
            </div>
            <ul className="space-y-3 border-t px-5 py-4">
                {sorted.length === 0 ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
                {sorted.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 text-sm">
                        <span className={cn("size-2 shrink-0 rounded-full", item.tone === "success" ? "bg-success" : item.tone === "info" ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden="true" />
                        <span className="text-foreground">{item.text}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{formatRelativeTime(item.at)}</span>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
