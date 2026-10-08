"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen, HardDrive, Image as ImageIcon, UploadCloud } from "lucide-react";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Today's upload-limit usage as a small ring (the library itself has no storage cap to measure against). */
function ProgressRing({ percent, label }: { percent: number; label: string }) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    return (
        <span className="relative flex size-12 shrink-0 items-center justify-center" role="img" aria-label={`${label}: ${value}%`}>
            <svg viewBox="0 0 44 44" className="size-12 -rotate-90" aria-hidden="true">
                <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
                <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
            </svg>
            <span className="absolute text-[11px] font-semibold tabular-nums text-foreground" aria-hidden="true">{value}%</span>
        </span>
    );
}

function Stat({ icon: Icon, tone, value, label, note, trailing }: { icon: typeof ImageIcon; tone: string; value: string | null; label: string; note?: string; trailing?: React.ReactNode }) {
    return (
        <Card className="gap-0 py-0 shadow-xs">
            <CardContent className="flex items-center gap-4 p-5">
                <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", tone)}>
                    <Icon className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-2xl font-semibold leading-tight tabular-nums text-foreground">{value ?? <SkeletonText className="h-7 w-20" />}</p>
                    <p className="truncate text-sm text-muted-foreground">{label}</p>
                    {note ? <p className="truncate text-xs text-muted-foreground">{note}</p> : null}
                </div>
                {trailing}
            </CardContent>
        </Card>
    );
}

/** Four numbers for the whole library, from the same usage call the settings tab uses. */
export function LibraryStats({ fallbackTotal = 0 }: { fallbackTotal?: number }) {
    const usage = useQuery({
        queryKey: ["media", "usage"],
        queryFn: () => api.getMediaUsage(),
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: false,
    });
    const data = usage.data;
    const ready = data && data.available ? data : null;
    const library = ready ? ready.library : null;
    const loading = usage.isLoading;
    // No usage numbers and nothing to fall back on: show nothing rather than four dashes.
    if (!loading && !library && fallbackTotal === 0) return null;

    const pick = (value: string) => (loading ? null : value);
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="library-stats">
            <Stat icon={ImageIcon} tone="bg-primary/10 text-primary" label="Total Files" value={pick(formatCount(library?.assets ?? fallbackTotal))} />
            <Stat
                icon={HardDrive}
                tone="bg-info-muted text-info-text"
                label="Storage Used"
                value={pick(library ? formatBytes(library.storedBytes) : "—")}
                trailing={ready ? <ProgressRing percent={ready.percent} label="Today's upload limit used" /> : undefined}
            />
            <Stat
                icon={UploadCloud}
                tone="bg-success-muted text-success-text"
                label="Uploaded Today"
                value={pick(ready ? formatCount(ready.objects) : "0")}
                note={ready && ready.limitsActive ? `of ${formatCount(ready.caps.projectObjects)} a day` : undefined}
            />
            <Stat icon={FolderOpen} tone="bg-warning-muted text-warning-text" label="Active Folders" value={pick(library ? formatCount(library.folders) : "0")} />
        </div>
    );
}
