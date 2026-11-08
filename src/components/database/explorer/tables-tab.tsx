"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TableView } from "./table-view";
import { containerWord, type ExplorerDataSource, formatCompact } from "./types";

interface TablesTabProps {
    source: ExplorerDataSource;
    selected: string | null;
    onSelect: (name: string) => void;
}

export function TablesTab({ source, selected, onSelect }: TablesTabProps) {
    const [filter, setFilter] = useState("");
    const tables = useQuery({ queryKey: ["explorer-tables", source.id], queryFn: () => source.listTables() });
    const word = containerWord(source.engine);

    const visible = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const all = tables.data ?? [];
        return q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all;
    }, [tables.data, filter]);

    const current = useMemo(() => tables.data?.find((t) => t.name === selected) ?? tables.data?.[0] ?? null, [tables.data, selected]);

    return (
        <div className="grid h-[calc(100dvh-9rem)] min-h-[520px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:h-[min(720px,calc(100vh-14rem))] md:min-h-[480px] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
            {/* Table list */}
            <aside className="flex min-h-0 flex-col border-b border-border/60 md:border-r md:border-b-0" aria-label={`Database ${word}`}>
                <div className="p-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Find a ${containerWord(source.engine, false)}`} aria-label={`Find a ${containerWord(source.engine, false)}`} className="h-8 pl-8 text-[13px]" />
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-x-auto pb-2 md:overflow-y-auto md:overflow-x-hidden">
                    {tables.isPending ? (
                        <div className="flex gap-1.5 px-2 md:block md:space-y-1" aria-hidden>
                            {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="h-8 w-24 shrink-0 animate-pulse rounded-md bg-muted/60 md:w-auto" />
                            ))}
                        </div>
                    ) : tables.isError ? (
                        <p className="px-3 py-4 text-[13px] text-muted-foreground">Couldn&apos;t read the {word}.</p>
                    ) : visible.length === 0 ? (
                        <p className="px-3 py-4 text-[13px] text-muted-foreground">{filter ? `No ${word} match “${filter}”.` : `No ${word} yet.`}</p>
                    ) : (
                        <ul className="flex gap-1.5 px-2 md:block md:gap-0 md:px-1.5">
                            {visible.map((t) => {
                                const active = current?.name === t.name;
                                return (
                                    <li key={t.name} className="shrink-0 md:shrink">
                                        <button
                                            type="button"
                                            onClick={() => onSelect(t.name)}
                                            aria-current={active ? "true" : undefined}
                                            className={cn(
                                                "flex h-8 w-auto items-center gap-2 rounded-md px-2.5 text-left md:w-full md:px-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                                                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                            )}
                                        >
                                            <Table2 className="size-3.5 shrink-0 opacity-70" aria-hidden />
                                            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{t.name}</span>
                                            {t.rows !== null ? <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{formatCompact(t.rows)}</span> : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </aside>

            {/* Rows */}
            <div className="min-h-0 min-w-0">
                {current ? (
                    <TableView key={`${source.id}:${current.name}`} source={source} table={current} />
                ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
                        {tables.isPending ? "" : `No ${word} to show yet.`}
                    </div>
                )}
            </div>
        </div>
    );
}
