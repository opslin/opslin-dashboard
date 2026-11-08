"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnMeta } from "./types";

export function isNullish(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function stringifyCell(value: unknown): string {
    if (isNullish(value)) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function parseDate(value: unknown): Date | null {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: unknown): string {
    const d = parseDate(value);
    if (!d) return stringifyCell(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function relativeTime(value: unknown, now = Date.now()): string {
    const d = parseDate(value);
    if (!d) return "";
    const diff = Math.round((now - d.getTime()) / 1000);
    const abs = Math.abs(diff);
    const suffix = diff >= 0 ? "ago" : "from now";
    if (abs < 60) return "just now";
    if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
    if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
    if (abs < 86400 * 60) return `${Math.floor(abs / 86400)}d ${suffix}`;
    return `${Math.floor(abs / (86400 * 30))}mo ${suffix}`;
}

function CopyOnClick({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            title="Copy"
            onClick={(event) => {
                event.stopPropagation();
                void navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                });
            }}
            className={cn("group/copy inline-flex max-w-full items-center gap-1 text-left", className)}
        >
            <span className="truncate">{children}</span>
            {copied ? (
                <Check className="size-3 shrink-0 text-success-text" aria-hidden />
            ) : (
                <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-60" aria-hidden />
            )}
        </button>
    );
}

export function VectorGlyph({ values, className }: { values: number[]; className?: string }) {
    const sample = values.slice(0, 24);
    const max = Math.max(0.0001, ...sample.map((v) => Math.abs(v)));
    return (
        <span className={cn("inline-flex h-4 items-end gap-px", className)} aria-hidden>
            {sample.map((v, i) => (
                <span
                    key={i}
                    className={cn("w-[2px] rounded-[1px]", v >= 0 ? "bg-info" : "bg-warning")}
                    style={{ height: `${Math.max(12, (Math.abs(v) / max) * 100)}%`, opacity: 0.85 }}
                />
            ))}
        </span>
    );
}

export function Cell({ value, column }: { value: unknown; column: ColumnMeta }) {
    if (isNullish(value)) {
        return <span className="text-muted-foreground/60 italic">null</span>;
    }
    switch (column.kind) {
        case "boolean": {
            const on = value === true || value === "true" || value === 1 || value === "t";
            return (
                <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", on ? "bg-success" : "bg-muted-foreground/40")} aria-hidden />
                    <span className={on ? "text-foreground" : "text-muted-foreground"}>{on ? "true" : "false"}</span>
                </span>
            );
        }
        case "number":
            return <span className="block text-right tabular-nums">{typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(value)}</span>;
        case "datetime":
            return (
                <span className="tabular-nums" title={`${String(value)} (${relativeTime(value)})`}>
                    {formatDate(value)}
                </span>
            );
        case "uuid": {
            const text = String(value);
            return (
                <CopyOnClick text={text} className="font-mono text-[12px] text-muted-foreground">
                    {text.slice(0, 8)}…{text.slice(-4)}
                </CopyOnClick>
            );
        }
        case "id": {
            const text = String(value);
            return (
                <CopyOnClick text={text} className="font-mono text-[12px] text-muted-foreground">
                    {text.length > 14 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text}
                </CopyOnClick>
            );
        }
        case "vector": {
            const arr = Array.isArray(value) ? (value as number[]) : parseVector(value);
            if (!arr) return <span className="font-mono text-[12px]">{String(value)}</span>;
            return (
                <span className="inline-flex items-center gap-2">
                    <VectorGlyph values={arr} />
                    <span className="font-mono text-[12px] text-muted-foreground">{arr.length} dims</span>
                </span>
            );
        }
        case "json": {
            const text = JSON.stringify(value);
            const keys = Array.isArray(value) ? `${(value as unknown[]).length} items` : value && typeof value === "object" ? `${Object.keys(value as object).length} keys` : "";
            return (
                <span className="inline-flex max-w-full items-center gap-2" title={text}>
                    <span className="truncate font-mono text-[12px] text-muted-foreground">{text}</span>
                    {keys ? <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">{keys}</span> : null}
                </span>
            );
        }
        default: {
            const text = stringifyCell(value);
            return <span title={text}>{text}</span>;
        }
    }
}

export function parseVector(value: unknown): number[] | null {
    if (Array.isArray(value)) return value.every((x) => typeof x === "number") ? (value as number[]) : null;
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        const parts = value.slice(1, -1).split(",").map(Number);
        return parts.every((n) => Number.isFinite(n)) ? parts : null;
    }
    return null;
}
