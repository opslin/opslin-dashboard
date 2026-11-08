import type { ColumnKind, ColumnMeta } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

export function kindFromDbType(type: string): ColumnKind {
    const t = type.toLowerCase();
    if (t.startsWith("vector") || t.includes("halfvec")) return "vector";
    if (t === "uuid") return "uuid";
    if (t.includes("bool") || t === "tinyint(1)") return "boolean";
    if (t.includes("json") || t === "objectid-doc" || t === "object" || t === "array") return "json";
    if (t.includes("timestamp") || t.includes("date") || t === "time" || t.startsWith("datetime")) return "datetime";
    if (/(int|serial|numeric|decimal|float|double|real|money|number)/.test(t)) return "number";
    if (t === "objectid") return "id";
    if (/(char|text|string|enum|citext|name)/.test(t)) return "text";
    return "other";
}

/** Fallback for agents that don't send column metadata yet: guess from the first rows. */
export function inferColumns(rows: Record<string, unknown>[]): ColumnMeta[] {
    if (rows.length === 0) return [];
    const names: string[] = [];
    for (const row of rows.slice(0, 20)) {
        for (const key of Object.keys(row)) if (!names.includes(key)) names.push(key);
    }
    return names.map((name, index) => {
        const sample = rows.map((r) => r[name]).find((v) => v !== null && v !== undefined);
        let kind: ColumnKind = "other";
        let type = "unknown";
        if (typeof sample === "number") {
            kind = "number";
            type = Number.isInteger(sample) ? "integer" : "numeric";
        } else if (typeof sample === "boolean") {
            kind = "boolean";
            type = "boolean";
        } else if (typeof sample === "string") {
            if (UUID_RE.test(sample)) {
                kind = "uuid";
                type = "uuid";
            } else if (ISO_RE.test(sample) && sample.length >= 10) {
                kind = "datetime";
                type = "timestamp";
            } else {
                kind = "text";
                type = "text";
            }
        } else if (Array.isArray(sample)) {
            kind = sample.length > 32 && sample.every((x) => typeof x === "number") ? "vector" : "json";
            type = kind === "vector" ? `vector(${sample.length})` : "array";
        } else if (sample && typeof sample === "object") {
            kind = "json";
            type = "json";
        } else if (sample === undefined) {
            kind = "text";
            type = "unknown";
        }
        const lower = name.toLowerCase();
        const primaryKey = index === 0 && (lower === "id" || lower === "_id" || lower.endsWith("_id"));
        return { name, type, kind: primaryKey && kind !== "uuid" && kind !== "number" ? "id" : kind, primaryKey };
    });
}
