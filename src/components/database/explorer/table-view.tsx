"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertCircle, Columns3, Download, Lock, RefreshCw, Rows3, Search, SearchX, TableProperties, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DataTable, DataTableSkeleton } from "./data-table";
import { stringifyCell } from "./cell";
import { FilterChips, FilterPopover } from "./filter-popover";
import { PaginationBar } from "./pagination-bar";
import { RowSheet } from "./row-sheet";
import {
    type ColumnFilter,
    type ColumnMeta,
    containerWord,
    DEFAULT_QUERY,
    type ExplorerDataSource,
    formatCount,
    type SortState,
    type TableQuery,
    type TableSummary,
} from "./types";

function toCsv(columns: ColumnMeta[], rows: Record<string, unknown>[]): string {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    return [columns.map((c) => esc(c.name)).join(","), ...rows.map((r) => columns.map((c) => esc(stringifyCell(r[c.name]))).join(","))].join("\n");
}

const NO_COLUMNS: ColumnMeta[] = [];

/** The parent gives each table its own instance (key = table name), so state never leaks between tables. */
interface TableViewProps {
    source: ExplorerDataSource;
    table: TableSummary;
}

export function TableView({ source, table }: TableViewProps) {
    const [query, setQuery] = useState<TableQuery>(DEFAULT_QUERY);
    const [searchInput, setSearchInput] = useState("");
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [density, setDensity] = useState<"compact" | "comfortable">("compact");
    const [activeRow, setActiveRow] = useState<number | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const searchTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(searchTimer.current), []);

    /** Typing waits 300 ms for a pause; clearing applies at once. */
    const changeSearch = useCallback((value: string) => {
        setSearchInput(value);
        window.clearTimeout(searchTimer.current);
        const apply = () => setQuery((q) => (q.search === value.trim() ? q : { ...q, search: value.trim(), page: 0 }));
        if (value.trim() === "") apply();
        else searchTimer.current = window.setTimeout(apply, 300);
    }, []);

    // "/" jumps to search, like every good table UI.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const result = useQuery({
        queryKey: ["explorer-table", source.id, table.name, query],
        queryFn: () => source.getTablePage(table.name, query),
        placeholderData: keepPreviousData,
    });

    const page = result.data;
    const columns = page?.columns ?? NO_COLUMNS;
    const rows = useMemo(() => page?.rows ?? [], [page]);
    const totalCount = page?.totalCount ?? 0;

    const setSort = useCallback((sort: SortState | null) => setQuery((q) => ({ ...q, sort, page: 0 })), []);
    const setFilters = useCallback((filters: ColumnFilter[]) => setQuery((q) => ({ ...q, filters, page: 0 })), []);

    const filtered = query.search !== "" || query.filters.length > 0;
    const firstLoad = result.isPending;
    const refreshing = result.isFetching && !firstLoad;

    const exportCsv = () => {
        const blob = new Blob([toCsv(columns.filter((c) => !hidden.has(c.name)), rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${table.name}-page-${query.page + 1}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const word = containerWord(source.engine, false);

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-3 py-2.5">
                <div className="flex min-w-0 items-baseline gap-2">
                    <h3 className="truncate text-sm font-semibold">{table.name}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {page ? `${formatCount(totalCount)} ${totalCount === 1 ? (source.engine === "mongodb" ? "document" : "row") : source.engine === "mongodb" ? "documents" : "rows"}` : ""}
                        {filtered && page ? " match" : ""}
                    </span>
                    {page?.elapsedMs !== undefined ? <span className="hidden shrink-0 text-xs text-muted-foreground/70 tabular-nums sm:inline">{page.elapsedMs} ms</span> : null}
                </div>
                {source.readOnly ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        <Lock className="size-3" aria-hidden /> Read-only
                    </span>
                ) : null}

                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                            ref={searchRef}
                            value={searchInput}
                            onChange={(e) => changeSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    changeSearch("");
                                    e.currentTarget.blur();
                                }
                            }}
                            placeholder={`Search ${word}`}
                            aria-label={`Search ${word}`}
                            className="h-8 w-56 pr-7 pl-8 text-[13px]"
                        />
                        {searchInput ? (
                            <button type="button" onClick={() => changeSearch("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                                <X className="size-3.5" />
                            </button>
                        ) : (
                            <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border/70 px-1 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
                        )}
                    </div>
                    <FilterPopover columns={columns} filters={query.filters} onApply={setFilters} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5">
                                <Columns3 className="size-3.5" aria-hidden />
                                Columns
                                {hidden.size > 0 ? <span className="text-muted-foreground">· {columns.length - hidden.size}/{columns.length}</span> : null}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {columns.map((c) => (
                                <DropdownMenuCheckboxItem
                                    key={c.name}
                                    checked={!hidden.has(c.name)}
                                    onSelect={(e) => e.preventDefault()}
                                    onCheckedChange={(checked) =>
                                        setHidden((prev) => {
                                            const next = new Set(prev);
                                            if (checked) next.delete(c.name);
                                            else if (columns.length - next.size > 1) next.add(c.name);
                                            return next;
                                        })
                                    }
                                >
                                    {c.name}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div role="group" aria-label="Row density" className="inline-flex h-8 items-center rounded-md border border-input p-0.5">
                        {([
                            ["compact", Rows3, "Compact rows"],
                            ["comfortable", TableProperties, "Comfortable rows"],
                        ] as const).map(([value, Icon, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={density === value}
                                aria-label={label}
                                title={label}
                                onClick={() => setDensity(value)}
                                className={`flex h-6 items-center rounded px-1.5 transition-colors ${density === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                <Icon className="size-3.5" />
                            </button>
                        ))}
                    </div>
                    <Button variant="outline" size="icon" className="size-8" onClick={exportCsv} disabled={rows.length === 0} aria-label="Export this page as CSV" title="Export this page as CSV">
                        <Download className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="size-8" onClick={() => void result.refetch()} aria-label="Refresh" title="Refresh">
                        <RefreshCw className={`size-3.5 ${result.isFetching ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            <FilterChips
                filters={query.filters}
                columns={columns}
                onRemove={(id) => setFilters(query.filters.filter((f) => f.id !== id))}
                onClear={() => setFilters([])}
            />

            {/* Body — same frame in every state */}
            {firstLoad ? (
                <DataTableSkeleton density={density} />
            ) : result.isError && !page ? (
                <StateMessage
                    icon={<AlertCircle className="size-5 text-danger-text" />}
                    title="Couldn't load rows"
                    body={result.error instanceof Error ? result.error.message : "The database didn't answer."}
                    action={<Button size="sm" onClick={() => void result.refetch()}>Try again</Button>}
                />
            ) : rows.length === 0 ? (
                filtered ? (
                    <StateMessage
                        icon={<SearchX className="size-5 text-muted-foreground" />}
                        title="No rows match"
                        body="Nothing in this table fits the search and filters."
                        action={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    changeSearch("");
                                    setQuery((q) => ({ ...q, search: "", filters: [], page: 0 }));
                                }}
                            >
                                Clear search and filters
                            </Button>
                        }
                    />
                ) : (
                    <StateMessage icon={<TableProperties className="size-5 text-muted-foreground" />} title={`This ${word} is empty`} body="Rows will show up here as soon as your app writes them." />
                )
            ) : (
                <DataTable
                    columns={columns}
                    rows={rows}
                    rowOffset={query.page * query.pageSize}
                    sort={query.sort}
                    onSortChange={setSort}
                    hiddenColumns={hidden}
                    density={density}
                    search={query.search}
                    refreshing={refreshing}
                    onRowClick={setActiveRow}
                    activeRow={activeRow}
                />
            )}

            <PaginationBar
                page={query.page}
                pageSize={query.pageSize}
                totalCount={totalCount}
                rowsOnPage={rows.length}
                onPageChange={(p) => setQuery((q) => ({ ...q, page: p }))}
                onPageSizeChange={(size) => setQuery((q) => ({ ...q, pageSize: size, page: 0 }))}
            />

            <RowSheet
                open={activeRow !== null}
                onOpenChange={(open) => !open && setActiveRow(null)}
                table={table.name}
                columns={columns}
                row={activeRow !== null ? (rows[activeRow] ?? null) : null}
                position={activeRow ?? 0}
                total={rows.length}
                onStep={(delta) => setActiveRow((i) => (i === null ? i : Math.min(rows.length - 1, Math.max(0, i + delta))))}
            />
        </div>
    );
}

function StateMessage({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            {icon}
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-sm text-[13px] text-muted-foreground">{body}</p>
            {action ? <div className="pt-1">{action}</div> : null}
        </div>
    );
}
