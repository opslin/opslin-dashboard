"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Database as DatabaseIcon, Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, type App, type Database } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { formatMb } from "./format";

const TH = "px-5 py-2.5 text-left text-xs font-medium text-muted-foreground";
const TD = "px-5 py-4 text-sm text-foreground";

function Section({ title, count, subtitle, action, children }: { title: string; count: number; subtitle: string; action: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        {title}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
                    </h2>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
                {action}
            </div>
            {children}
        </Card>
    );
}

function Empty({ icon: Icon, text, action }: { icon: typeof Rocket; text: string; action: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 border-t px-5 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{text}</p>
            {action}
        </div>
    );
}

function AppTableRow({ app }: { app: App }) {
    const { data } = useQuery({
        queryKey: ["app-metrics-current", app.id],
        queryFn: () => api.getAppMetricsCurrent(app.id),
        enabled: app.status === "running",
        refetchInterval: 30_000,
        retry: false,
    });
    return (
        <tr className="border-t transition-colors hover:bg-muted/40">
            <td className={TD}>
                <Link href={`/apps/${app.id}`} className="flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold uppercase text-background" aria-hidden="true">{app.name.slice(0, 1)}</span>
                    <span className="min-w-0">
                        <span className="block truncate font-semibold">{app.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{app.domain || "No domain yet"}</span>
                    </span>
                </Link>
            </td>
            <td className={TD}><StatusBadge status={app.effectiveStatus ?? app.status} /></td>
            <td className={TD}>{app.port ?? "—"}</td>
            <td className={TD}>{formatMb(data?.memoryUsed)}</td>
            <td className={TD}>{app.deployedAt ? formatRelativeTime(app.deployedAt) : "—"}</td>
        </tr>
    );
}

export function AppsDatabasesTab({ serverId, apps, databases }: { serverId: string; apps: App[]; databases: Database[] }) {
    return (
        <div className="space-y-5">
            <Section
                title="Apps"
                count={apps.length}
                subtitle="Applications running on this server"
                action={<Button asChild><Link href={`/apps/new?server=${serverId}`}><Rocket aria-hidden="true" /> Deploy app</Link></Button>}
            >
                {apps.length === 0 ? (
                    <Empty icon={Rocket} text="No apps yet. Deploy your first one in two steps." action={<Button asChild size="sm"><Link href={`/apps/new?server=${serverId}`}>Deploy app</Link></Button>} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse">
                            <thead className="bg-muted/40">
                                <tr>
                                    <th className={TH}>Name</th>
                                    <th className={TH}>Status</th>
                                    <th className={TH}>Port</th>
                                    <th className={TH}>Memory</th>
                                    <th className={TH}>Last deploy</th>
                                </tr>
                            </thead>
                            <tbody>
                                {apps.map((app) => (
                                    <AppTableRow key={app.id} app={app} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            <Section
                title="Databases"
                count={databases.length}
                subtitle="Databases provisioned on this server"
                action={<Button asChild variant="outline"><Link href={`/databases/new?server=${serverId}`}><Plus aria-hidden="true" /> New database</Link></Button>}
            >
                {databases.length === 0 ? (
                    <Empty icon={DatabaseIcon} text="No databases on this server." action={<Button asChild size="sm" variant="outline"><Link href={`/databases/new?server=${serverId}`}>New database</Link></Button>} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse">
                            <thead className="bg-muted/40">
                                <tr>
                                    <th className={TH}>Name</th>
                                    <th className={TH}>Engine</th>
                                    <th className={TH}>Port</th>
                                    <th className={TH}>Created</th>
                                    <th className={TH}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {databases.map((database) => (
                                    <tr key={database.id} className="border-t transition-colors hover:bg-muted/40">
                                        <td className={TD}>
                                            <Link href={`/databases/${database.id}`} className="flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-ring">
                                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><DatabaseIcon className="size-4" aria-hidden="true" /></span>
                                                <span className="font-semibold">{database.name}</span>
                                            </Link>
                                        </td>
                                        <td className={TD}>{database.type.replace("_", " ")}</td>
                                        <td className={TD}>{database.port ?? "—"}</td>
                                        <td className={TD}>{formatRelativeTime(database.createdAt)}</td>
                                        <td className={TD}><StatusBadge status={database.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </div>
    );
}
