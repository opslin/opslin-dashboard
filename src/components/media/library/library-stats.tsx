"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen, HardDrive, Image as ImageIcon, UploadCloud } from "lucide-react";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonText } from "@/components/patterns/skeleton";
import { api } from "@/lib/api";

function Stat({ icon: Icon, label, value, note }: { icon: typeof ImageIcon; label: string; value: string | null; note?: string }) {
    return (
        <Card className="@container/card gap-1 py-4 shadow-xs">
            <CardHeader className="gap-1">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-xl font-semibold tabular-nums sm:text-2xl">{value ?? <SkeletonText className="h-7 w-20" />}</CardTitle>
                <CardAction>
                    <span className="hidden size-10 items-center sm:flex justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                    </span>
                </CardAction>
            </CardHeader>
            {note ? <p className="-mt-1 px-6 text-xs text-muted-foreground">{note}</p> : null}
        </Card>
    );
}

/** Four numbers for the whole library, from the same usage call the settings tab uses. */
export function LibraryStats() {
    const usage = useQuery({
        queryKey: ["media", "usage"],
        queryFn: () => api.getMediaUsage(),
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: false,
    });
    const data = usage.data;
    const ready = data && data.available;
    const library = ready ? data.library : null;
    const loading = usage.isLoading;
    if (!loading && !library) return null;

    const pick = (value: string) => (loading ? null : value);
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="library-stats">
            <Stat icon={ImageIcon} label="Total images" value={pick(formatCount(library?.assets ?? 0))} />
            <Stat icon={HardDrive} label="Storage used" value={pick(formatBytes(library?.storedBytes ?? 0))} />
            <Stat icon={FolderOpen} label="Folders" value={pick(formatCount(library?.folders ?? 0))} />
            <Stat
                icon={UploadCloud}
                label="Uploads today"
                value={pick(ready ? formatCount(data.objects) : "0")}
                note={ready && data.limitsActive ? `of ${formatCount(data.caps.projectObjects)} a day` : undefined}
            />
        </div>
    );
}
