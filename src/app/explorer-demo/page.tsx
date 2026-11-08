"use client";

import { Suspense, useMemo, useState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { DatabaseExplorer } from "@/components/database/explorer/database-explorer";
import { createDemoSource, type DemoEngineKey } from "@/components/database/explorer/mock-source";
import { DatabaseBrandIcon } from "@/components/database/database-brand-icon";
import { engineLabel } from "@/components/database/explorer/types";
import { cn } from "@/lib/utils";

const ENGINES: { key: DemoEngineKey; label: string }[] = [
    { key: "postgresql", label: "PostgreSQL" },
    { key: "pgvector", label: "PostgreSQL + pgvector" },
    { key: "mysql", label: "MySQL" },
    { key: "mongodb", label: "MongoDB" },
];

function ExplorerDemo() {
    // Simulation only: fake data, no server calls. Hidden in production builds.
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_DEMOS !== "1") notFound();

    // Deep links: /explorer-demo?engine=mongodb&tab=tables&table=events
    const params = useSearchParams();
    const fromUrl = params.get("engine");
    const [key, setKey] = useState<DemoEngineKey>(ENGINES.some((e) => e.key === fromUrl) ? (fromUrl as DemoEngineKey) : "postgresql");
    const [linked, setLinked] = useState(true);
    const initialTab = linked && params.get("tab") === "tables" ? "tables" : "general";
    const initialTable = linked && key === fromUrl ? params.get("table") : null;
    const source = useMemo(() => createDemoSource(key), [key]);

    return (
        <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <DatabaseBrandIcon engine={source.engine} size={36} />
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">{source.name}</h1>
                        <p className="text-[13px] text-muted-foreground">{engineLabel(source.engine)} · Simulated data</p>
                    </div>
                </div>
                <div role="tablist" aria-label="Database engine" className="inline-flex flex-wrap rounded-lg border border-border/60 p-0.5">
                    {ENGINES.map((e) => (
                        <button
                            key={e.key}
                            role="tab"
                            aria-selected={key === e.key}
                            onClick={() => {
                                setLinked(false);
                                setKey(e.key);
                            }}
                            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", key === e.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            {e.label}
                        </button>
                    ))}
                </div>
            </div>
            <DatabaseExplorer key={source.id} source={source} initialTab={initialTab} initialTable={initialTable} />
        </main>
    );
}

export default function ExplorerDemoPage() {
    return (
        <Suspense fallback={null}>
            <ExplorerDemo />
        </Suspense>
    );
}
