import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Cell, parseVector, relativeTime } from "../cell";
import { inferColumns, kindFromDbType } from "../infer";
import { createDemoSource } from "../mock-source";
import { PaginationBar } from "../pagination-bar";
import { DEFAULT_QUERY, formatBytes, opsForKind } from "../types";

describe("column kinds", () => {
    it.each([
        ["vector(1536)", "vector"],
        ["uuid", "uuid"],
        ["boolean", "boolean"],
        ["tinyint(1)", "boolean"],
        ["jsonb", "json"],
        ["timestamptz", "datetime"],
        ["numeric(10,2)", "number"],
        ["varchar(255)", "text"],
        ["ObjectId", "id"],
    ])("%s is %s", (type, kind) => {
        expect(kindFromDbType(type)).toBe(kind);
    });

    it("guesses kinds from rows when the agent sends no column metadata", () => {
        const cols = inferColumns([
            { id: 1, name: "Ada", ok: true, at: "2026-01-02T03:04:05Z", ref: "7d444840-9dc0-11d1-b245-5ffdce74fad2", meta: { a: 1 } },
        ]);
        expect(Object.fromEntries(cols.map((c) => [c.name, c.kind]))).toEqual({
            id: "number",
            name: "text",
            ok: "boolean",
            at: "datetime",
            ref: "uuid",
            meta: "json",
        });
        expect(cols[0].primaryKey).toBe(true);
    });

    it("returns no columns for no rows", () => {
        expect(inferColumns([])).toEqual([]);
    });

    it("offers only sensible conditions per kind", () => {
        expect(opsForKind("boolean")).not.toContain("gt");
        expect(opsForKind("number")).toContain("gte");
        expect(opsForKind("vector")).toEqual(["is_null", "not_null"]);
    });
});

describe("formatting", () => {
    it("formats bytes", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    });

    it("parses vectors from text and arrays", () => {
        expect(parseVector("[1,2,3]")).toEqual([1, 2, 3]);
        expect(parseVector([0.5, 1])).toEqual([0.5, 1]);
        expect(parseVector("[a,b]")).toBeNull();
    });

    it("describes how long ago something was", () => {
        const now = Date.UTC(2026, 10, 7, 12, 0, 0);
        expect(relativeTime("2026-11-07T11:30:00Z", now)).toBe("30m ago");
        expect(relativeTime("2026-11-05T12:00:00Z", now)).toBe("2d ago");
    });
});

describe("cells", () => {
    it("shows null as muted text", () => {
        render(<Cell value={null} column={{ name: "x", type: "text", kind: "text" }} />);
        expect(screen.getByText("null")).toBeVisible();
    });

    it("shows booleans as words, not 0/1", () => {
        render(<Cell value={true} column={{ name: "x", type: "boolean", kind: "boolean" }} />);
        expect(screen.getByText("true")).toBeVisible();
    });

    it("summarises a vector instead of printing every number", () => {
        render(<Cell value={Array.from({ length: 384 }, (_, i) => i / 384)} column={{ name: "e", type: "vector(384)", kind: "vector" }} />);
        expect(screen.getByText("384 dims")).toBeVisible();
    });
});

describe("simulation data source behaves like the real API", () => {
    const query = (patch: Partial<typeof DEFAULT_QUERY>) => ({ ...DEFAULT_QUERY, ...patch });

    it("pages through a table and reports the full count", async () => {
        const source = createDemoSource("postgresql");
        const first = await source.getTablePage("products", query({ pageSize: 25 }));
        const last = await source.getTablePage("products", query({ pageSize: 25, page: 48 }));
        expect(first.totalCount).toBe(1204);
        expect(first.rows).toHaveLength(25);
        expect(last.rows).toHaveLength(4); // 1204 = 48 * 25 + 4
    });

    it("searches across text columns, case-insensitively", async () => {
        const source = createDemoSource("postgresql");
        const all = await source.getTablePage("users", query({}));
        const hit = await source.getTablePage("users", query({ search: "GARCIA" }));
        expect(hit.totalCount).toBeGreaterThan(0);
        expect(hit.totalCount).toBeLessThan(all.totalCount);
        for (const row of hit.rows) expect(JSON.stringify(Object.values(row)).toLowerCase()).toContain("garcia");
    });

    it("combines filters with AND", async () => {
        const source = createDemoSource("postgresql");
        const pro = await source.getTablePage("users", query({ filters: [{ id: "1", column: "plan", op: "equals", value: "pro" }] }));
        const proVerified = await source.getTablePage("users", query({
            filters: [
                { id: "1", column: "plan", op: "equals", value: "pro" },
                { id: "2", column: "is_verified", op: "equals", value: "true" },
            ],
        }));
        expect(proVerified.totalCount).toBeLessThan(pro.totalCount);
        expect(proVerified.rows.every((r) => r.plan === "pro" && r.is_verified === true)).toBe(true);
    });

    it("filters numbers and dates", async () => {
        const source = createDemoSource("postgresql");
        const big = await source.getTablePage("orders", query({ filters: [{ id: "1", column: "total_amount", op: "gte", value: "400" }] }));
        expect(big.rows.every((r) => Number(r.total_amount) >= 400)).toBe(true);
        const recent = await source.getTablePage("orders", query({ filters: [{ id: "1", column: "created_at", op: "gte", value: "2026-10-01" }] }));
        expect(recent.rows.every((r) => String(r.created_at) >= "2026-10-01")).toBe(true);
    });

    it("sorts, with nulls last in both directions", async () => {
        const source = createDemoSource("postgresql");
        for (const direction of ["asc", "desc"] as const) {
            const res = await source.getTablePage("users", query({ pageSize: 250, sort: { column: "last_seen_at", direction } }));
            const values = res.rows.map((r) => r.last_seen_at);
            const firstNull = values.findIndex((v) => v === null);
            if (firstNull >= 0) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
        }
        const asc = await source.getTablePage("orders", query({ pageSize: 100, sort: { column: "total_amount", direction: "asc" } }));
        const amounts = asc.rows.map((r) => Number(r.total_amount));
        expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    });

    it("gives every engine tables with data", async () => {
        for (const key of ["postgresql", "pgvector", "mysql", "mongodb"] as const) {
            const source = createDemoSource(key);
            const tables = await source.listTables();
            expect(tables.length).toBeGreaterThan(0);
            const page = await source.getTablePage(tables[0].name, query({ pageSize: 5 }));
            expect(page.rows.length).toBe(5);
            expect(page.columns.length).toBeGreaterThan(2);
        }
    });

    it("includes real vector columns for pgvector", async () => {
        const page = await createDemoSource("pgvector").getTablePage("documents", query({ pageSize: 1 }));
        expect(page.columns.find((c) => c.kind === "vector")?.type).toBe("vector(384)");
        expect((page.rows[0].embedding as number[]).length).toBe(384);
    });

    it("rejects a table that isn't there", async () => {
        await expect(createDemoSource("mysql").getTablePage("nope", query({}))).rejects.toThrow(/nope/);
    });
});

describe("pagination bar", () => {
    const base = { pageSize: 50, totalCount: 12480, rowsOnPage: 50, onPageSizeChange: vi.fn() };

    it("shows the row range and page count", () => {
        render(<PaginationBar {...base} page={2} onPageChange={vi.fn()} />);
        expect(screen.getByText("101–150 of 12,480")).toBeVisible();
        expect(screen.getByText("250")).toBeVisible();
    });

    it("disables first and previous on the first page, last and next on the last", () => {
        const { rerender } = render(<PaginationBar {...base} page={0} onPageChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
        rerender(<PaginationBar {...base} page={249} rowsOnPage={30} onPageChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    });

    it("moves between pages and jumps to a typed page", () => {
        const onPageChange = vi.fn();
        render(<PaginationBar {...base} page={2} onPageChange={onPageChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Next page" }));
        expect(onPageChange).toHaveBeenLastCalledWith(3);
        fireEvent.click(screen.getByRole("button", { name: "Last page" }));
        expect(onPageChange).toHaveBeenLastCalledWith(249);
        fireEvent.change(screen.getByRole("textbox", { name: "Go to page" }), { target: { value: "99999" } });
        fireEvent.submit(screen.getByRole("textbox", { name: "Go to page" }));
        expect(onPageChange).toHaveBeenLastCalledWith(249); // clamped to the last page
    });

    it("says 0 rows for an empty result", () => {
        render(<PaginationBar {...base} page={0} totalCount={0} rowsOnPage={0} onPageChange={vi.fn()} />);
        expect(screen.getByText("0 rows")).toBeVisible();
    });
});
