export type ExplorerEngine = "postgresql" | "postgresql_vector" | "mysql" | "mongodb";

export type ColumnKind =
    | "id"
    | "text"
    | "number"
    | "boolean"
    | "datetime"
    | "json"
    | "uuid"
    | "vector"
    | "other";

export interface ColumnMeta {
    name: string;
    /** Engine type as the database reports it, e.g. `varchar(255)`, `jsonb`, `vector(1536)`. */
    type: string;
    kind: ColumnKind;
    primaryKey?: boolean;
    nullable?: boolean;
}

export interface TableSummary {
    name: string;
    kind: "table" | "collection" | "view";
    /** null when the agent on this server can't report it yet. */
    rows: number | null;
    sizeBytes: number | null;
    columns?: number;
}

export interface DatabaseInfo {
    version: string;
    sizeBytes: number | null;
    tableCount: number;
    rowCount: number | null;
    connections?: { active: number; max: number };
    uptimeSeconds?: number;
    charset?: string;
    extensions?: string[];
}

export type FilterOp =
    | "contains"
    | "equals"
    | "not_equals"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "is_null"
    | "not_null";

export interface ColumnFilter {
    id: string;
    column: string;
    op: FilterOp;
    value: string;
}

export interface SortState {
    column: string;
    direction: "asc" | "desc";
}

export interface TableQuery {
    /** Zero-based. */
    page: number;
    pageSize: number;
    search: string;
    sort: SortState | null;
    filters: ColumnFilter[];
}

export interface TablePage {
    columns: ColumnMeta[];
    rows: Record<string, unknown>[];
    totalCount: number;
    elapsedMs?: number;
}

/**
 * Everything the explorer needs from a database. The real implementation calls the
 * Opslin API; the simulation implementation answers from memory.
 */
export interface ExplorerDataSource {
    id: string;
    engine: ExplorerEngine;
    name: string;
    readOnly: boolean;
    getInfo(): Promise<DatabaseInfo>;
    listTables(): Promise<TableSummary[]>;
    getTablePage(table: string, query: TableQuery): Promise<TablePage>;
}

export const PAGE_SIZES = [25, 50, 100, 250] as const;

export const DEFAULT_QUERY: TableQuery = {
    page: 0,
    pageSize: 50,
    search: "",
    sort: null,
    filters: [],
};

export function engineLabel(engine: ExplorerEngine): string {
    switch (engine) {
        case "postgresql":
            return "PostgreSQL";
        case "postgresql_vector":
            return "PostgreSQL + pgvector";
        case "mysql":
            return "MySQL";
        case "mongodb":
            return "MongoDB";
    }
}

export function containerWord(engine: ExplorerEngine, plural = true): string {
    if (engine === "mongodb") return plural ? "collections" : "collection";
    return plural ? "tables" : "table";
}

const OPS_BY_KIND: Record<ColumnKind, FilterOp[]> = {
    id: ["equals", "not_equals", "contains", "is_null", "not_null"],
    uuid: ["equals", "not_equals", "contains", "is_null", "not_null"],
    text: ["contains", "equals", "not_equals", "is_null", "not_null"],
    number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_null", "not_null"],
    boolean: ["equals", "is_null", "not_null"],
    datetime: ["gt", "gte", "lt", "lte", "equals", "is_null", "not_null"],
    json: ["contains", "is_null", "not_null"],
    vector: ["is_null", "not_null"],
    other: ["contains", "equals", "is_null", "not_null"],
};

export function opsForKind(kind: ColumnKind): FilterOp[] {
    return OPS_BY_KIND[kind];
}

export function opLabel(op: FilterOp, kind: ColumnKind): string {
    if (kind === "datetime") {
        if (op === "gt") return "is after";
        if (op === "gte") return "is on or after";
        if (op === "lt") return "is before";
        if (op === "lte") return "is on or before";
    }
    switch (op) {
        case "contains":
            return "contains";
        case "equals":
            return kind === "boolean" ? "is" : "equals";
        case "not_equals":
            return "does not equal";
        case "gt":
            return "greater than";
        case "gte":
            return "at least";
        case "lt":
            return "less than";
        case "lte":
            return "at most";
        case "is_null":
            return "is empty";
        case "not_null":
            return "is not empty";
    }
}

export function opNeedsValue(op: FilterOp): boolean {
    return op !== "is_null" && op !== "not_null";
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** i;
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatCount(n: number): string {
    return new Intl.NumberFormat("en-US").format(n);
}

export function formatCompact(n: number): string {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
