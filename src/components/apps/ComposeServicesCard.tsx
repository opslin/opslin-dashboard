"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, type ComposeServiceItem } from "@/lib/api";

// The services of a compose project, with its databases marked (doc 67). Flat rows, label left and state right
// (DESIGN.md). The databases belong to the project's own compose file, so there is nothing to manage here: the card
// only says what is running. Nothing is shown for an app that is not a compose project.

const ENGINE: Record<string, { label: string; logo: string }> = {
    postgres: { label: "PostgreSQL", logo: "/brands/postgresql.svg" },
    mysql: { label: "MySQL", logo: "/brands/mysql.svg" },
    mariadb: { label: "MariaDB", logo: "/brands/mysql.svg" },
    mongodb: { label: "MongoDB", logo: "/brands/mongodb.svg" },
    redis: { label: "Redis", logo: "/brands/redis.svg" },
};

function roleLabel(service: ComposeServiceItem): string {
    if (service.role === "database") return `Database · ${ENGINE[service.kind ?? ""]?.label ?? "Database"}`;
    if (service.role === "supporting") return "Supporting";
    return service.primary ? "Public app" : "App";
}

export function ComposeServicesCard({ appId }: { appId: string }) {
    const { data } = useQuery({
        queryKey: ["compose-services", appId],
        queryFn: () => api.getComposeServices(appId),
        retry: false,
        staleTime: 60_000,
    });
    const services = data?.services ?? [];
    if (services.length === 0) return null;
    const hasDatabase = services.some((service) => service.role === "database");

    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <div className="flex items-center gap-2 px-5 py-4">
                <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-foreground">Services</h2>
            </div>
            <ul className="divide-y border-t">
                {services.map((service) => {
                    const engine = service.role === "database" ? ENGINE[service.kind ?? ""] : undefined;
                    const detail = service.image ?? (service.built ? "Built from your code" : "");
                    return (
                        <li key={service.name} className="flex min-h-12 items-center gap-3 px-5 py-2.5">
                            {engine ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={engine.logo} alt="" width={16} height={16} className="size-4 shrink-0 dark:rounded-[3px] dark:bg-foreground/90 dark:p-px" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{service.name}</p>
                                {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
                            </div>
                            <span className="shrink-0 text-sm text-muted-foreground">{roleLabel(service)}</span>
                        </li>
                    );
                })}
            </ul>
            {hasDatabase ? <p className="border-t px-5 py-3 text-xs text-muted-foreground">Your compose file creates and runs this database.</p> : null}
        </Card>
    );
}
