import { api, type DatabaseTableColumn, type DatabaseTablesResult } from "@/lib/api";
import { inferColumns } from "./infer";
import type { ColumnMeta, DatabaseInfo, ExplorerDataSource, ExplorerEngine, TablePage, TableQuery, TableSummary } from "./types";

interface ApiSourceOptions {
    serverId: string;
    dbId: string;
    engine: ExplorerEngine;
    name: string;
    readOnly: boolean;
}

/** The General tab and the table list both need the same response; ask the server once. */
function once<T>(load: () => Promise<T>, ttlMs = 4000) {
    let at = 0;
    let pending: Promise<T> | null = null;
    return () => {
        const now = Date.now();
        if (!pending || now - at > ttlMs) {
            at = now;
            pending = load().catch((error) => {
                pending = null;
                throw error;
            });
        }
        return pending;
    };
}

function toColumns(columns: DatabaseTableColumn[] | undefined, rows: Record<string, unknown>[], remembered: ColumnMeta[] | undefined): ColumnMeta[] {
    if (columns && columns.length > 0) return columns;
    const inferred = inferColumns(rows);
    // Agents without column metadata give no hint on an empty page: keep the headers we saw before.
    return inferred.length > 0 ? inferred : (remembered ?? []);
}

export function createApiSource({ serverId, dbId, engine, name, readOnly }: ApiSourceOptions): ExplorerDataSource {
    const loadTables = once<DatabaseTablesResult>(() => api.getDatabaseTables(serverId, dbId));
    const seenColumns = new Map<string, ColumnMeta[]>();

    return {
        id: `${serverId}:${dbId}`,
        engine,
        name,
        readOnly,

        async listTables(): Promise<TableSummary[]> {
            const result = await loadTables();
            const kind = engine === "mongodb" ? "collection" : "table";
            if (result.details && result.details.length > 0) {
                const byName = new Map(result.details.map((d) => [d.name, d]));
                // Keep the server's alphabetical order for the list; sizes come from the details.
                const names = result.tables.length > 0 ? result.tables : result.details.map((d) => d.name);
                return names.map((n) => {
                    const d = byName.get(n);
                    return { name: n, kind: d?.kind ?? kind, rows: d?.rows ?? null, sizeBytes: d?.sizeBytes ?? null, columns: d?.columns };
                });
            }
            return result.tables.map((n) => ({ name: n, kind, rows: null, sizeBytes: null }));
        },

        async getInfo(): Promise<DatabaseInfo> {
            const result = await loadTables();
            const info = result.info;
            return {
                version: info?.version ?? "Not reported",
                sizeBytes: info?.sizeBytes ?? null,
                tableCount: info?.tableCount ?? result.tables.length,
                rowCount: info?.rowCount ?? null,
                connections: info?.connections,
                uptimeSeconds: info?.uptimeSeconds,
                charset: info?.charset,
                extensions: info?.extensions,
            };
        },

        async getTablePage(table: string, query: TableQuery): Promise<TablePage> {
            const started = performance.now();
            const result = await api.getDatabaseTableData(serverId, dbId, table, query.pageSize, query.page * query.pageSize, {
                search: query.search || undefined,
                sort: query.sort,
                filters: query.filters.map((f) => ({ column: f.column, op: f.op, value: f.value })),
            });
            const columns = toColumns(result.columns, result.rows, seenColumns.get(table));
            if (columns.length > 0) seenColumns.set(table, columns);
            return {
                columns,
                rows: result.rows,
                totalCount: result.totalCount,
                elapsedMs: result.elapsedMs ?? Math.round(performance.now() - started),
            };
        },
    };
}
