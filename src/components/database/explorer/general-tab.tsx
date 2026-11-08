"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    containerWord,
    type DatabaseInfo,
    engineLabel,
    type ExplorerDataSource,
    formatBytes,
    formatCompact,
    formatCount,
    formatUptime,
    type TableSummary,
} from "./types";

interface GeneralTabProps {
    source: ExplorerDataSource;
    onOpenTable: (name: string) => void;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="min-w-0 px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums">{value}</div>
            {hint ? <div className="truncate text-xs text-muted-foreground">{hint}</div> : null}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border/50 px-4 py-2 text-[13px] last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right font-medium">{children}</span>
        </div>
    );
}

export function GeneralTab({ source, onOpenTable }: GeneralTabProps) {
    const info = useQuery({ queryKey: ["explorer-info", source.id], queryFn: () => source.getInfo() });
    const tables = useQuery({ queryKey: ["explorer-tables", source.id], queryFn: () => source.listTables() });

    const list = tables.data ?? [];
    const hasSizes = list.some((t) => t.sizeBytes !== null);
    const largest = [...list].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) || (b.rows ?? 0) - (a.rows ?? 0) || a.name.localeCompare(b.name)).slice(0, 8);
    const maxSize = Math.max(1, ...largest.map((t) => t.sizeBytes ?? 0));
    const word = containerWord(source.engine);
    const unit = source.engine === "mongodb" ? "documents" : "rows";

    return (
        <div className="divide-y divide-border/60">
            <StatStrip info={info.data} loading={info.isPending} word={word} unit={unit} />

            <section aria-label={`Largest ${word}`}>
                <div className="flex items-center justify-between px-4 pt-4 pb-1">
                    <h3 className="text-sm font-semibold">{hasSizes ? `Largest ${word}` : `All ${word}`}</h3>
                    <span className="text-xs text-muted-foreground">{tables.data ? `${list.length} total` : ""}</span>
                </div>
                {tables.isPending ? (
                    <LoadingRows count={5} />
                ) : tables.isError ? (
                    <p className="px-4 py-6 text-[13px] text-muted-foreground">Couldn&apos;t read the {word}. Check that the database is running, then refresh.</p>
                ) : largest.length === 0 ? (
                    <p className="px-4 py-6 text-[13px] text-muted-foreground">No {word} yet. They show up here as soon as your app creates them.</p>
                ) : (
                    <ul>
                        {largest.map((t) => (
                            <TableRowItem key={t.name} t={t} max={maxSize} unit={unit} onOpen={() => onOpenTable(t.name)} />
                        ))}
                    </ul>
                )}
            </section>

            <section aria-label="Database details">
                <h3 className="px-4 pt-4 pb-1 text-sm font-semibold">Details</h3>
                {info.isPending ? (
                    <LoadingRows count={4} />
                ) : info.data ? (
                    <div>
                        <Row label="Engine">{engineLabel(source.engine)}</Row>
                        <Row label="Version">{info.data.version}</Row>
                        {info.data.charset ? <Row label="Encoding">{info.data.charset}</Row> : null}
                        {info.data.uptimeSeconds !== undefined ? <Row label="Running for">{formatUptime(info.data.uptimeSeconds)}</Row> : null}
                        <Row label="Access">{source.readOnly ? "Read-only" : "Read and write"}</Row>
                        {info.data.extensions && info.data.extensions.length > 0 ? (
                            <Row label="Extensions">
                                <span className="inline-flex flex-wrap justify-end gap-1">
                                    {info.data.extensions.map((e) => (
                                        <span key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal">
                                            {e}
                                        </span>
                                    ))}
                                </span>
                            </Row>
                        ) : null}
                    </div>
                ) : (
                    <p className="px-4 py-6 text-[13px] text-muted-foreground">Couldn&apos;t read database details.</p>
                )}
            </section>
        </div>
    );
}

function StatStrip({ info, loading, word, unit }: { info?: DatabaseInfo; loading: boolean; word: string; unit: string }) {
    const conn = info?.connections;
    const stats = [
        { label: "Size on disk", value: info && info.sizeBytes !== null ? formatBytes(info.sizeBytes) : "—" },
        { label: word[0].toUpperCase() + word.slice(1), value: info ? formatCount(info.tableCount) : "—" },
        { label: `Total ${unit}`, value: info && info.rowCount !== null ? formatCompact(info.rowCount) : "—", hint: info && info.rowCount !== null ? `${formatCount(info.rowCount)} ${unit}` : undefined },
        { label: "Connections", value: conn ? `${conn.active} / ${conn.max}` : "—", hint: conn ? `${Math.round((conn.active / Math.max(1, conn.max)) * 100)}% in use` : undefined },
    ];
    return (
        <div className={cn("grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-4 sm:divide-y-0", loading && "animate-pulse")}>
            {stats.map((s) => (
                <Stat key={s.label} {...s} />
            ))}
        </div>
    );
}

function TableRowItem({ t, max, unit, onOpen }: { t: TableSummary; max: number; unit: string; onOpen: () => void }) {
    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                className="group flex min-h-11 w-full items-center gap-4 border-b border-border/50 px-4 py-2 text-left text-[13px] outline-none transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50"
            >
                <span className="w-44 min-w-0 shrink-0 truncate font-medium sm:w-56">{t.name}</span>
                <span className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, ((t.sizeBytes ?? 0) / max) * 100)}%` }} />
                </span>
                <span className="ml-auto w-20 text-right text-muted-foreground tabular-nums sm:ml-0">{t.sizeBytes === null ? "—" : formatBytes(t.sizeBytes)}</span>
                <span className="hidden w-28 text-right text-muted-foreground tabular-nums md:block">
                    {t.rows === null ? "—" : `${formatCompact(t.rows)} ${unit}`}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
        </li>
    );
}

function LoadingRows({ count }: { count: number }) {
    return (
        <div aria-hidden>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex h-11 items-center gap-4 border-b border-border/50 px-4 last:border-0">
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                    <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted/70" />
                </div>
            ))}
        </div>
    );
}
