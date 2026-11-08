"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Search } from "lucide-react";
import { BrandTile } from "@/components/marketplace/brand-tile";
import { EntrySheet } from "@/components/marketplace/entry-sheet";
import { filterMarketplaceEntries, marketplaceTimeLabel, marketplaceVerifiedLabel } from "@/components/marketplace/marketplace-format";
import { DeployProgressDialog } from "@/components/apps/DeployProgressDialog";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMarketplace } from "@/hooks/use-marketplace";
import type { MarketplaceEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

type StartedJob = { serverId: string; jobId: string; label: string };

function EntryCard({ entry, onOpen }: { entry: MarketplaceEntry; onOpen: () => void }) {
    const time = marketplaceTimeLabel(entry);
    return (
        <Card className="gap-4 p-5">
            <div className="flex items-center gap-3">
                <BrandTile entry={entry} />
                <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-foreground">{entry.name}</h2>
                    <p className="truncate text-sm text-muted-foreground">{entry.label}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <StatusBadge status={entry.verified ? "success" : "pending"} tone={entry.verified ? "success" : "neutral"} label={marketplaceVerifiedLabel(entry)} />
                {time ? <span className="text-sm text-muted-foreground">{time}</span> : null}
                <Button size="sm" className="ml-auto" onClick={onOpen} aria-label={`Deploy ${entry.name}`}>Deploy</Button>
            </div>
        </Card>
    );
}

/** The real catalog. Kept, but not shown to anyone while Marketplace is "coming soon" (see the marketplace page). */
export function MarketplaceCatalog() {
    const { data, isLoading, isError } = useMarketplace();
    const [category, setCategory] = useState("All");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<MarketplaceEntry | null>(null);
    const [job, setJob] = useState<StartedJob | null>(null);
    const [progressOpen, setProgressOpen] = useState(false);

    const catalog = data && !data.locked ? data.catalog : null;
    const shown = useMemo(() => (catalog ? filterMarketplaceEntries(catalog.entries, category, query) : []), [catalog, category, query]);
    const categories = useMemo(() => ["All", ...(catalog?.categories ?? [])], [catalog]);

    if (data?.locked) {
        return (
            <div className="mx-auto w-full max-w-5xl px-4 py-8">
                <Card className="flex-row items-center gap-3 p-5">
                    <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium">Marketplace isn&apos;t turned on for this organization</span>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search software" aria-label="Search software" className="pl-9" />
                </div>
            </div>

            <div role="tablist" aria-label="Category" className="flex gap-1 overflow-x-auto border-b border-border/70">
                {categories.map((name) => (
                    <button
                        key={name}
                        type="button"
                        role="tab"
                        aria-selected={category === name}
                        onClick={() => setCategory(name)}
                        className={cn(
                            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                            category === name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {name}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading Marketplace">
                    {Array.from({ length: 6 }, (_, index) => (
                        <Card key={index} className="gap-4 p-5"><SkeletonText className="h-12 w-full" /><SkeletonText className="h-6 w-2/3" /></Card>
                    ))}
                </div>
            ) : isError ? (
                <Card className="p-5 text-sm text-muted-foreground">Could not load the Marketplace. Try again in a moment.</Card>
            ) : shown.length === 0 ? (
                <Card className="p-5 text-sm text-muted-foreground">No software matches your search.</Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((entry) => (
                        <EntryCard key={entry.slug} entry={entry} onOpen={() => setSelected(entry)} />
                    ))}
                </div>
            )}

            <EntrySheet
                entry={selected}
                onClose={() => setSelected(null)}
                onStarted={(started) => { setJob(started); setProgressOpen(true); }}
            />

            {job ? (
                <DeployProgressDialog
                    serverId={job.serverId}
                    jobId={job.jobId}
                    appLabel={job.label}
                    fromMarketplace
                    open={progressOpen}
                    onOpenChange={setProgressOpen}
                />
            ) : null}

            {job && !progressOpen ? (
                <p className="text-sm text-muted-foreground">
                    {job.label} is deploying. <button type="button" className="font-medium text-primary hover:underline" onClick={() => setProgressOpen(true)}>Show progress</button> or open <Link href="/apps" className="font-medium text-primary hover:underline">Apps</Link>.
                </p>
            ) : null}
        </div>
    );
}
