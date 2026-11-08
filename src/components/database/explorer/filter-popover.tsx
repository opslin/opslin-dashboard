"use client";

import { useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadixPopover, RadixPopoverContent, RadixPopoverTrigger } from "@/components/ui/popover-radix";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    type ColumnFilter,
    type ColumnMeta,
    type FilterOp,
    opLabel,
    opNeedsValue,
    opsForKind,
} from "./types";

let counter = 0;
const nextId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

function defaultOp(column: ColumnMeta): FilterOp {
    return opsForKind(column.kind)[0];
}

interface FilterPopoverProps {
    columns: ColumnMeta[];
    filters: ColumnFilter[];
    onApply: (filters: ColumnFilter[]) => void;
}

export function FilterPopover({ columns, filters, onApply }: FilterPopoverProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<ColumnFilter[]>(filters);

    const byName = (name: string) => columns.find((c) => c.name === name) ?? columns[0];

    const addRow = () => {
        // Start on a column people actually filter by, not the row id.
        const first = columns.find((c) => c.kind !== "uuid" && c.kind !== "id" && !c.primaryKey) ?? columns[0];
        if (!first) return;
        setDraft((d) => [...d, { id: nextId(), column: first.name, op: defaultOp(first), value: "" }]);
    };

    const update = (id: string, patch: Partial<ColumnFilter>) =>
        setDraft((d) => d.map((f) => (f.id === id ? { ...f, ...patch } : f)));

    const apply = () => {
        const valid = draft.filter((f) => !opNeedsValue(f.op) || f.value.trim() !== "");
        onApply(valid);
        setOpen(false);
    };

    return (
        <RadixPopover
            open={open}
            onOpenChange={(next) => {
                if (next) setDraft(filters);
                setOpen(next);
            }}
        >
            <RadixPopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Filter className="size-3.5" aria-hidden />
                    Filter
                    {filters.length > 0 ? (
                        <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">{filters.length}</span>
                    ) : null}
                </Button>
            </RadixPopoverTrigger>
            <RadixPopoverContent align="start" className="w-[min(560px,calc(100vw-2rem))] p-0">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        apply();
                    }}
                >
                    <div className="flex items-center justify-between px-3 pt-3 pb-2">
                        <span className="text-[13px] font-medium">Show rows where</span>
                        {draft.length > 0 ? (
                            <button type="button" onClick={() => setDraft([])} className="text-xs text-muted-foreground hover:text-foreground">
                                Clear all
                            </button>
                        ) : null}
                    </div>

                    {draft.length === 0 ? (
                        <p className="px-3 pb-3 text-[13px] text-muted-foreground">No filters yet. Add one to narrow the rows.</p>
                    ) : (
                        <ul className="max-h-72 space-y-2 overflow-y-auto px-3 pb-3">
                            {draft.map((f) => {
                                const col = byName(f.column);
                                const ops = opsForKind(col.kind);
                                return (
                                    <li key={f.id} className="flex items-center gap-2">
                                        <Select
                                            value={f.column}
                                            onValueChange={(name) => {
                                                const next = byName(name);
                                                update(f.id, { column: name, op: opsForKind(next.kind).includes(f.op) ? f.op : defaultOp(next), value: "" });
                                            }}
                                        >
                                            <SelectTrigger size="sm" className="w-36 shrink-0" aria-label="Column">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="popper">
                                                {columns.map((c) => (
                                                    <SelectItem key={c.name} value={c.name}>
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={f.op} onValueChange={(op) => update(f.id, { op: op as FilterOp })}>
                                            <SelectTrigger size="sm" className="w-36 shrink-0" aria-label="Condition">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="popper">
                                                {ops.map((op) => (
                                                    <SelectItem key={op} value={op}>
                                                        {opLabel(op, col.kind)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {opNeedsValue(f.op) ? (
                                            col.kind === "boolean" ? (
                                                <Select value={f.value || undefined} onValueChange={(value) => update(f.id, { value })}>
                                                    <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Value">
                                                        <SelectValue placeholder="Pick a value" />
                                                    </SelectTrigger>
                                                    <SelectContent position="popper">
                                                        <SelectItem value="true">true</SelectItem>
                                                        <SelectItem value="false">false</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    value={f.value}
                                                    onChange={(e) => update(f.id, { value: e.target.value })}
                                                    placeholder={col.kind === "datetime" ? "2026-11-01" : col.kind === "number" ? "0" : "Value"}
                                                    inputMode={col.kind === "number" ? "decimal" : undefined}
                                                    className="h-8 min-w-0 flex-1 text-[13px]"
                                                    aria-label="Value"
                                                    autoFocus={!f.value}
                                                />
                                            )
                                        ) : (
                                            <div className="flex-1" />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setDraft((d) => d.filter((x) => x.id !== f.id))}
                                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            aria-label="Remove filter"
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={addRow}>
                            <Plus className="size-3.5" aria-hidden />
                            Add filter
                        </Button>
                        <Button type="submit" size="sm" className="h-8">
                            Apply filters
                        </Button>
                    </div>
                </form>
            </RadixPopoverContent>
        </RadixPopover>
    );
}

export function FilterChips({
    filters,
    columns,
    onRemove,
    onClear,
}: {
    filters: ColumnFilter[];
    columns: ColumnMeta[];
    onRemove: (id: string) => void;
    onClear: () => void;
}) {
    if (filters.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
            {filters.map((f) => {
                const kind = columns.find((c) => c.name === f.column)?.kind ?? "text";
                return (
                    <span key={f.id} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                        <span className="font-medium">{f.column}</span>
                        <span className="text-muted-foreground">{opLabel(f.op, kind)}</span>
                        {opNeedsValue(f.op) ? <span className="font-mono">{f.value}</span> : null}
                        <button type="button" onClick={() => onRemove(f.id)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove filter on ${f.column}`}>
                            <X className="size-3" />
                        </button>
                    </span>
                );
            })}
            <button type="button" onClick={onClear} className="px-1 text-xs text-muted-foreground hover:text-foreground">
                Clear filters
            </button>
        </div>
    );
}
