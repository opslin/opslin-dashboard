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

            expect(confirmSpy).toHaveBeenCalled();
            await waitFor(() => {
                expect(api.runDatabaseQuery).toHaveBeenCalledWith(
                    "server-1",
                    "db-1",
                    "UPDATE users SET role = 'admin' WHERE id = 1"
                );
            });
        });

        it("never runs the query if the user cancels the confirmation", async () => {
            confirmSpy.mockReturnValue(false);
            renderPage();

            const input = await screen.findByTestId("run-query-input");
            fireEvent.change(input, { target: { value: "DELETE FROM users" } });
            fireEvent.click(screen.getByTestId("run-query-button"));

            expect(confirmSpy).toHaveBeenCalled();
            expect(api.runDatabaseQuery).not.toHaveBeenCalled();
        });
    });

    describe("Browse Tables", () => {
        it("lists tables and loads rows for the selected one", async () => {
            vi.mocked(api.getDatabaseTableData).mockResolvedValue({
                rows: [{ id: 1, email: "a@example.com" }],
                totalCount: 1,
            });
            renderPage();

            const select = await screen.findByTestId("browse-table-select");
            await waitFor(() => expect(screen.getByRole("option", { name: "users" })).toBeInTheDocument());
            fireEvent.change(select, { target: { value: "users" } });

            await waitFor(() => {
                expect(api.getDatabaseTableData).toHaveBeenCalledWith("server-1", "db-1", "users", 50, 0);
            });
            const results = await screen.findByTestId("browse-table-results");
            expect(within(results).getByText("a@example.com")).toBeVisible();
        });

        it("shows an empty state when the table has no rows", async () => {
            vi.mocked(api.getDatabaseTableData).mockResolvedValue({ rows: [], totalCount: 0 });
            renderPage();

            const select = await screen.findByTestId("browse-table-select");
            await waitFor(() => expect(screen.getByRole("option", { name: "orders" })).toBeInTheDocument());
            fireEvent.change(select, { target: { value: "orders" } });

            expect(await screen.findByText("No rows in this table.")).toBeVisible();
        });
    });
});
