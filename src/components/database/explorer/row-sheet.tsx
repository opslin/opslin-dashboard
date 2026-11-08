"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cell, isNullish, parseVector, relativeTime, stringifyCell, VectorGlyph } from "./cell";
import type { ColumnMeta } from "./types";

interface RowSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    table: string;
    columns: ColumnMeta[];
    row: Record<string, unknown> | null;
    position: number;
    total: number;
    onStep: (delta: -1 | 1) => void;
}

function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    return {
        copied,
        copy(key: string, text: string) {
            void navigator.clipboard?.writeText(text).then(() => {
                setCopied(key);
                window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
            });
        },
    };
}

export function RowSheet({ open, onOpenChange, table, columns, row, position, total, onStep }: RowSheetProps) {
    const { copied, copy } = useCopy();
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
                <SheetHeader className="border-b border-border/60 p-4 pr-12">
                    <SheetTitle className="text-base">Row in {table}</SheetTitle>
                    <SheetDescription>
                        {position + 1} of {total} on this page
                    </SheetDescription>
                    <div className="flex gap-1.5 pt-1">
                        <Button variant="outline" size="sm" className="h-7 gap-1" disabled={position <= 0} onClick={() => onStep(-1)}>
                            <ChevronUp className="size-3.5" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 gap-1" disabled={position >= total - 1} onClick={() => onStep(1)}>
                            <ChevronDown className="size-3.5" /> Next
                        </Button>
                    </div>
                </SheetHeader>

                {row ? (
                    <Tabs defaultValue="fields" className="flex min-h-0 flex-1 flex-col gap-0">
                        <TabsList variant="line" className="px-4">
                            <TabsTrigger value="fields">Fields</TabsTrigger>
                            <TabsTrigger value="json">JSON</TabsTrigger>
                        </TabsList>
                        <TabsContent value="fields" className="min-h-0 flex-1 overflow-y-auto">
                            <dl className="divide-y divide-border/50">
                                {columns.map((col) => {
                                    const value = row[col.name];
                                    const vector = col.kind === "vector" ? parseVector(value) : null;
                                    return (
                                        <div key={col.name} className="group grid grid-cols-[120px_1fr_auto] items-start gap-3 px-4 py-2.5">
                                            <dt className="min-w-0">
                                                <div className="truncate text-[13px] font-medium">{col.name}</div>
                                                <div className="truncate font-mono text-[10.5px] text-muted-foreground">{col.type}</div>
                                            </dt>
                                            <dd className="min-w-0 break-words text-[13px]">
                                                {col.kind === "json" && !isNullish(value) ? (
                                                    <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11.5px] leading-relaxed">
                                                        {JSON.stringify(value, null, 2)}
                                                    </pre>
                                                ) : vector ? (
                                                    <div className="space-y-1.5">
                                                        <VectorGlyph values={vector} className="h-6" />
                                                        <div className="font-mono text-[11.5px] text-muted-foreground">
                                                            [{vector.slice(0, 6).map((n) => n.toFixed(3)).join(", ")}, … {vector.length} dims]
                                                        </div>
                                                    </div>
                                                ) : col.kind === "datetime" && !isNullish(value) ? (
                                                    <div>
                                                        <Cell value={value} column={col} />
                                                        <div className="text-xs text-muted-foreground">{relativeTime(value)}</div>
                                                    </div>
                                                ) : (
                                                    <span className="whitespace-pre-wrap">
                                                        {isNullish(value) ? <span className="text-muted-foreground/60 italic">null</span> : stringifyCell(value)}
                                                    </span>
                                                )}
                                            </dd>
                                            <button
                                                type="button"
                                                onClick={() => copy(col.name, vector ? JSON.stringify(vector) : stringifyCell(value))}
                                                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                                aria-label={`Copy ${col.name}`}
                                            >
                                                {copied === col.name ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </dl>
                        </TabsContent>
                        <TabsContent value="json" className="min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="mb-2 flex justify-end">
                                <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => copy("__row", JSON.stringify(row, null, 2))}>
                                    {copied === "__row" ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
                                    Copy JSON
                                </Button>
                            </div>
                            <pre className="overflow-auto rounded-md bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(row, null, 2)}</pre>
                        </TabsContent>
                    </Tabs>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
