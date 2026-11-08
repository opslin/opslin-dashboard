"use client";

import { useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCount, PAGE_SIZES } from "./types";

interface PaginationBarProps {
    page: number;
    pageSize: number;
    totalCount: number;
    rowsOnPage: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

export function PaginationBar({ page, pageSize, totalCount, rowsOnPage, onPageChange, onPageSizeChange }: PaginationBarProps) {
    const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    const first = totalCount === 0 ? 0 : page * pageSize + 1;
    const last = page * pageSize + rowsOnPage;
    // null = show the current page; a string = the user is typing a page number.
    const [typed, setTyped] = useState<string | null>(null);
    const jump = typed ?? String(page + 1);

    const go = (next: number) => onPageChange(Math.min(pageCount - 1, Math.max(0, next)));

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-[13px]">
            <div className="flex items-center gap-3 text-muted-foreground">
                <span className="tabular-nums">
                    {totalCount === 0 ? "0 rows" : `${formatCount(first)}–${formatCount(last)} of ${formatCount(totalCount)}`}
                </span>
                <span className="hidden items-center gap-2 sm:flex">
                    Rows per page
                    <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                        <SelectTrigger size="sm" className="h-7 w-[72px]" aria-label="Rows per page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                            {PAGE_SIZES.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </span>
            </div>

            <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-7" onClick={() => go(0)} disabled={page === 0} aria-label="First page">
                    <ChevronFirst className="size-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="size-7" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">
                    <ChevronLeft className="size-3.5" />
                </Button>
                <form
                    className="flex items-center gap-1.5 px-1 text-muted-foreground"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const n = Number.parseInt(jump, 10);
                        if (Number.isFinite(n)) go(n - 1);
                        setTyped(null);
                    }}
                >
                    Page
                    <Input
                        value={jump}
                        onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
                        onBlur={() => setTyped(null)}
                        className="h-7 w-12 px-1 text-center text-[13px] tabular-nums"
                        aria-label="Go to page"
                        inputMode="numeric"
                    />
                    of <span className="tabular-nums">{formatCount(pageCount)}</span>
                </form>
                <Button variant="outline" size="icon" className="size-7" onClick={() => go(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
                    <ChevronRight className="size-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="size-7" onClick={() => go(pageCount - 1)} disabled={page >= pageCount - 1} aria-label="Last page">
                    <ChevronLast className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}
