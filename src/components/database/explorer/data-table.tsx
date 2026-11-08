"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Key } from "lucide-react";
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Cell, stringifyCell } from "./cell";
import type { ColumnMeta, SortState } from "./types";

type Row = Record<string, unknown>;

interface DataTableProps {
    columns: ColumnMeta[];
    rows: Row[];
    /** Absolute index of the first row on this page (for the # column). */
    rowOffset: number;
    sort: SortState | null;
    onSortChange: (sort: SortState | null) => void;
    hiddenColumns: Set<string>;
    density: "compact" | "comfortable";
    search: string;
    /** True while a new page is loading; rows stay on screen but dim. */
    refreshing: boolean;
    onRowClick: (rowIndex: number) => void;
    activeRow: number | null;
}

function Highlight({ text, term }: { text: string; term: string }) {
    if (!term) return <>{text}</>;
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded-[2px] bg-warning-muted text-warning-text">{text.slice(index, index + term.length)}</mark>
            {text.slice(index + term.length)}
        </>
    );
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
    if (direction === "asc") return <ArrowUp className="size-3.5 text-foreground" aria-hidden />;
    if (direction === "desc") return <ArrowDown className="size-3.5 text-foreground" aria-hidden />;
    return <ChevronsUpDown className="size-3.5 opacity-0 group-hover/head:opacity-60" aria-hidden />;
}

export function DataTable({
    columns,
    rows,
    rowOffset,
    sort,
    onSortChange,
    hiddenColumns,
    density,
    search,
    refreshing,
    onRowClick,
    activeRow,
}: DataTableProps) {
    const visible = useMemo(() => columns.filter((c) => !hiddenColumns.has(c.name)), [columns, hiddenColumns]);

    const defs = useMemo<ColumnDef<Row>[]>(
        () =>
            visible.map((meta) => ({
                id: meta.name,
                accessorFn: (row) => row[meta.name],
                header: () => meta.name,
                cell: (ctx) => {
                    const value = ctx.getValue();
                    const searchable = meta.kind === "text" || meta.kind === "other";
                    if (search && searchable && typeof value === "string") {
                        return <Highlight text={value} term={search} />;
                    }
                    return <Cell value={value} column={meta} />;
                },
                meta,
            })),
        [visible, search]
    );

    // Sorting, paging and filtering all happen on the server, so TanStack only builds the model.
    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table opts out of memoization by design
    const table = useReactTable({
        data: rows,
        columns: defs,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
        manualFiltering: true,
    });

    const rowHeight = density === "compact" ? "h-9" : "h-12";

    const cycleSort = (name: string) => {
        if (!sort || sort.column !== name) onSortChange({ column: name, direction: "asc" });
        else if (sort.direction === "asc") onSortChange({ column: name, direction: "desc" });
        else onSortChange(null);
    };

    return (
        <div className={cn("relative min-h-0 flex-1 overflow-auto transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
            {/* A plain <table>: shadcn's Table adds its own scroller, which would stop the header from sticking. */}
            <table className="w-full caption-bottom border-separate border-spacing-0 text-[13px]">
                <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-0">
                    {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id} className="hover:bg-transparent">
                            <TableHead className="sticky left-0 z-20 h-9 w-12 min-w-12 border-r border-b border-border/70 bg-card px-3 text-right text-[11px] font-normal text-muted-foreground tabular-nums">
                                #
                            </TableHead>
                            {group.headers.map((header) => {
                                const meta = header.column.columnDef.meta as ColumnMeta;
                                const direction = sort?.column === meta.name ? sort.direction : null;
                                return (
                                    <TableHead
                                        key={header.id}
                                        aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                                        className="h-9 min-w-[140px] border-b border-border/70 bg-card px-3 py-0"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => cycleSort(meta.name)}
                                            className={cn(
                                                "group/head flex w-full items-center gap-1.5 text-left outline-none focus-visible:underline",
                                                meta.kind === "number" && "justify-end"
                                            )}
                                        >
                                            {meta.primaryKey ? <Key className="size-3 shrink-0 text-warning-text" aria-label="Primary key" /> : null}
                                            <span className="truncate text-[12px] font-medium text-foreground">{meta.name}</span>
                                            <span className="shrink-0 truncate font-mono text-[10.5px] font-normal text-muted-foreground/80">{meta.type}</span>
                                            <SortIcon direction={direction} />
                                        </button>
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.map((row, i) => (
                        <TableRow
                            key={row.id}
                            data-state={activeRow === i ? "selected" : undefined}
                            onClick={() => onRowClick(i)}
                            className={cn("cursor-pointer border-0", rowHeight)}
                        >
                            <TableCell className="sticky left-0 z-[1] w-12 min-w-12 border-r border-b border-border/40 bg-card px-3 py-0 text-right text-[11px] text-muted-foreground tabular-nums">
                                {rowOffset + i + 1}
                            </TableCell>
                            {row.getVisibleCells().map((cell) => {
                                const meta = cell.column.columnDef.meta as ColumnMeta;
                                return (
                                    <TableCell
                                        key={cell.id}
                                        className={cn(
                                            "max-w-[340px] truncate border-b border-border/40 px-3 py-0 align-middle",
                                            meta.kind === "number" && "text-right"
                                        )}
                                        title={meta.kind === "text" ? stringifyCell(cell.getValue()) : undefined}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </table>
        </div>
    );
}

export function DataTableSkeleton({ columns = 6, rows = 12, density }: { columns?: number; rows?: number; density: "compact" | "comfortable" }) {
    return (
        <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
            <div className="flex h-9 items-center gap-6 border-b border-border/70 px-3">
                {Array.from({ length: columns }).map((_, c) => (
                    <div key={c} className="h-3 w-24 animate-pulse rounded bg-muted" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className={cn("flex items-center gap-6 border-b border-border/40 px-3", density === "compact" ? "h-9" : "h-12")}>
                    {Array.from({ length: columns }).map((_, c) => (
                        <div
                            key={c}
                            className="h-3 animate-pulse rounded bg-muted/70"
                            style={{ width: `${[96, 140, 72, 120, 88, 110][c % 6]}px`, animationDelay: `${r * 40}ms` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
