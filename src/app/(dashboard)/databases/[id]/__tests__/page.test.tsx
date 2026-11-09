import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseDetailPage from "../page";
import { api, type Database } from "@/lib/api";

const navigationMocks = vi.hoisted(() => ({
    push: vi.fn(),
    searchParams: new URLSearchParams("server=server-1"),
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "db-1" }),
    useRouter: () => navigationMocks,
    useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            getDatabase: vi.fn(),
            getDbPassword: vi.fn(),
            startDatabase: vi.fn(),
            stopDatabase: vi.fn(),
            deleteDatabase: vi.fn(),
            setDbReadOnly: vi.fn(),
            runDatabaseQuery: vi.fn(),
            getDatabaseTables: vi.fn(),
            getDatabaseTableData: vi.fn(),
            uploadSeedScript: vi.fn(),
            runSeedScript: vi.fn(),
            getSeedScriptHistory: vi.fn(),
        },
    };
});

const postgresDatabase: Database = {
    id: "db-1",
    name: "orders-db",
    type: "postgresql",
    status: "running",
    port: 5432,
    hostPort: 20000,
    username: "opslin_orders",
    exposure: "internal",
    readOnly: false,
    cpuLimit: 1,
    memoryLimit: 512,
    createdAt: "2026-01-01T00:00:00.000Z",
};

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <DatabaseDetailPage />
        </QueryClientProvider>
    );
}

describe("DatabaseDetailPage", () => {
    let writeText: ReturnType<typeof vi.fn>;
    let confirmSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams("server=server-1");
        vi.mocked(api.getDatabase).mockResolvedValue(postgresDatabase);
        vi.mocked(api.getDbPassword).mockResolvedValue({ password: "e9GB24ranow_)kiV_hWv84Sr" });
        vi.mocked(api.getDatabaseTables).mockResolvedValue({ tables: ["users", "orders"] });
        writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    it("renders the database header and connection details", async () => {
        renderPage();

        expect(await screen.findByRole("heading", { name: "orders-db" })).toBeVisible();
        expect(screen.getByText("Running")).toBeVisible();
        expect(screen.getAllByText("opslin_orders").length).toBeGreaterThan(0);
    });

    it("fetches and copies the connection password", async () => {
        renderPage();

        await screen.findByRole("heading", { name: "orders-db" });
        const showButtons = screen.getAllByText("Show");
        fireEvent.click(showButtons[0]);

        await waitFor(() => {
            expect(api.getDbPassword).toHaveBeenCalledWith("server-1", "db-1");
        });
    });

    describe("Run Query", () => {
        it("is disabled and shows a read-only notice when the database is read-only", async () => {
            vi.mocked(api.getDatabase).mockResolvedValue({ ...postgresDatabase, readOnly: true });
            renderPage();

            const input = await screen.findByTestId("run-query-input");
            expect(input).toBeDisabled();
            expect(screen.getByTestId("run-query-button")).toBeDisabled();
            expect(screen.getByText(/enable write access above to run a query/i)).toBeVisible();
        });

        it("asks for confirmation, then runs the query and shows the affected-row count", async () => {
            vi.mocked(api.runDatabaseQuery).mockResolvedValue({ success: true, rowsAffected: 1 });
            renderPage();

            const input = await screen.findByTestId("run-query-input");
            fireEvent.change(input, { target: { value: "UPDATE users SET role = 'admin' WHERE id = 1" } });
            fireEvent.click(screen.getByTestId("run-query-button"));

            // The confirmation is an in-page dialog, never the browser's pop-up (embedded browsers silently cancel that one).
            expect(confirmSpy).not.toHaveBeenCalled();
            expect(await screen.findByText("Run this query?")).toBeVisible();
            expect(api.runDatabaseQuery).not.toHaveBeenCalled();
            fireEvent.click(screen.getByTestId("confirm-action-button"));
            await waitFor(() => {
                expect(api.runDatabaseQuery).toHaveBeenCalledWith(
                    "server-1",
                    "db-1",
                    "UPDATE users SET role = 'admin' WHERE id = 1"
                );
            });
        });

        it("never runs the query if the user cancels the confirmation", async () => {
            renderPage();

            const input = await screen.findByTestId("run-query-input");
            fireEvent.change(input, { target: { value: "DELETE FROM users" } });
            fireEvent.click(screen.getByTestId("run-query-button"));

            expect(confirmSpy).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
            await waitFor(() => expect(screen.queryByText("Run this query?")).toBeNull());
            expect(api.runDatabaseQuery).not.toHaveBeenCalled();
        });
    });

    describe("Seed Script", () => {
        it("a script uploaded earlier and still staged (page reloaded) can be run from the history", async () => {
            vi.mocked(api.getSeedScriptHistory).mockResolvedValue({ runs: [{ id: "run-9", filename: "old.js", language: "js", sizeBytes: 10, sha256: "ab", status: "STAGED", createdAt: new Date().toISOString() }] } as never);
            vi.mocked(api.runSeedScript).mockResolvedValue({ jobId: "job-9" } as never);
            renderPage();
            fireEvent.click(await screen.findByTestId("seed-script-history-run-button"));
            expect(confirmSpy).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByTestId("confirm-action-button"));
            await waitFor(() => expect(api.runSeedScript).toHaveBeenCalledWith("server-1", "db-1", "run-9"));
        });

        it("asks in the page, then queues the staged script (the Run button must not depend on a browser pop-up)", async () => {
            vi.mocked(api.uploadSeedScript).mockResolvedValue({ id: "run-1", filename: "seed.js", language: "js", sizeBytes: 2048, sha256: "abcdef0123456789", status: "staged" } as never);
            vi.mocked(api.runSeedScript).mockResolvedValue({ jobId: "job-1" } as never);
            vi.mocked(api.getSeedScriptHistory).mockResolvedValue({ runs: [] } as never);
            renderPage();

            const input = await screen.findByTestId("seed-script-file-input");
            fireEvent.change(input, { target: { files: [new File(["x"], "seed.js", { type: "text/javascript" })] } });
            fireEvent.click(await screen.findByTestId("seed-script-run-button"));

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(await screen.findByText("Run this seed script?")).toBeVisible();
            expect(api.runSeedScript).not.toHaveBeenCalled();
            fireEvent.click(screen.getByTestId("confirm-action-button"));
            await waitFor(() => expect(api.runSeedScript).toHaveBeenCalledWith("server-1", "db-1", "run-1"));
        });
    });

    describe("General and Tables tabs", () => {
        const openTablesTab = async () => {
            const tab = await screen.findByTestId("database-tables-tab");
            fireEvent.mouseDown(tab, { button: 0 });
            fireEvent.click(tab);
        };

        it("shows the database overview on the General tab", async () => {
            vi.mocked(api.getDatabaseTables).mockResolvedValue({
                tables: ["orders", "users"],
                details: [
                    { name: "orders", kind: "table", rows: 1200, sizeBytes: 4_194_304 },
                    { name: "users", kind: "table", rows: 300, sizeBytes: 65_536 },
                ],
                info: { version: "PostgreSQL 16.4", sizeBytes: 8_388_608, tableCount: 2, rowCount: 1500, connections: { active: 3, max: 100 }, charset: "UTF8" },
            });
            renderPage();

            const overview = await screen.findByTestId("database-overview");
            expect(await within(overview).findByText("8.0 MB")).toBeVisible();
            expect(within(overview).getByText("PostgreSQL 16.4")).toBeVisible();
            expect(within(overview).getByRole("button", { name: /orders/ })).toBeVisible();
        });

        it("lists tables and loads the first page of the selected one", async () => {
            vi.mocked(api.getDatabaseTableData).mockResolvedValue({
                rows: [{ id: 1, email: "a@example.com" }],
                totalCount: 1,
                columns: [
                    { name: "id", type: "bigint", kind: "number", primaryKey: true },
                    { name: "email", type: "text", kind: "text" },
                ],
            });
            renderPage();
            await openTablesTab();

            const explorer = await screen.findByTestId("database-table-explorer");
            fireEvent.click(await within(explorer).findByRole("button", { name: /users/ }));

            await waitFor(() => {
                expect(api.getDatabaseTableData).toHaveBeenCalledWith("server-1", "db-1", "users", 50, 0, { search: undefined, sort: null, filters: [] });
            });
            expect(await within(explorer).findByText("a@example.com")).toBeVisible();
            expect(within(explorer).getByText("1 row")).toBeVisible();
        });

        it("sends the search to the server instead of filtering the visible page", async () => {
            vi.mocked(api.getDatabaseTableData).mockResolvedValue({ rows: [{ id: 1, email: "a@example.com" }], totalCount: 1, columns: [{ name: "email", type: "text", kind: "text" }] });
            renderPage();
            await openTablesTab();

            const explorer = await screen.findByTestId("database-table-explorer");
            await within(explorer).findByText("a@example.com");
            fireEvent.change(within(explorer).getByRole("textbox", { name: "Search table" }), { target: { value: "garcia" } });

            await waitFor(() => {
                expect(api.getDatabaseTableData).toHaveBeenCalledWith("server-1", "db-1", "users", 50, 0, { search: "garcia", sort: null, filters: [] });
            });
        });

        it("shows an empty state when the table has no rows", async () => {
            vi.mocked(api.getDatabaseTableData).mockResolvedValue({ rows: [], totalCount: 0, columns: [{ name: "id", type: "bigint", kind: "number" }] });
            renderPage();
            await openTablesTab();

            expect(await screen.findByText("This table is empty")).toBeVisible();
        });
    });
});
