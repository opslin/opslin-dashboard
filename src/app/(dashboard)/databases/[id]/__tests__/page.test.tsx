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

vi.mock("@/components/layout/header", () => ({
    Header: ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
        <header>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
            {actions}
        </header>
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
            testDatabase: vi.fn(),
            setDbReadOnly: vi.fn(),
            seedDatabase: vi.fn(),
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

describe("DatabaseDetailPage connection UX", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams("server=server-1");
        vi.mocked(api.getDatabase).mockResolvedValue(postgresDatabase);
        vi.mocked(api.getDbPassword).mockResolvedValue({
            password: "e9GB24ranow_)kiV_hWv84Sr",
        });
        vi.mocked(api.testDatabase).mockResolvedValue({
            connected: true,
            message: "Database is running and accepting connections",
            checkedAt: "2026-01-01T00:00:00.000Z",
        });
        writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
    });

    it("separates deployed app and server/local connection strings", async () => {
        renderPage();

        expect(await screen.findByText("DATABASE_URL for deployed apps")).toBeVisible();
        const appCard = screen.getByTestId("app-database-url-card");
        const localCard = screen.getByTestId("local-database-url-card");

        expect(within(appCard).getByText(/host\.docker\.internal/)).toBeVisible();
        expect(within(appCard).queryByText(/localhost/)).not.toBeInTheDocument();
        expect(within(localCard).getByText(/localhost:20000/)).toBeVisible();
    });

    it("fetches the password before copying the app URL and never copies placeholders", async () => {
        renderPage();

        await screen.findByText("DATABASE_URL for deployed apps");
        fireEvent.click(screen.getByRole("button", { name: /Copy DATABASE_URL for App/i }));

        await waitFor(() => {
            expect(api.getDbPassword).toHaveBeenCalledWith("server-1", "db-1");
        });
        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(
                "postgresql://opslin_orders:e9GB24ranow_%29kiV_hWv84Sr@host.docker.internal:20000/orders-db"
            );
        });
        expect(String(writeText.mock.calls[0][0])).not.toContain("****");
        expect(String(writeText.mock.calls[0][0])).not.toContain("@localhost");
        expect(screen.queryByText(/e9GB24ranow/)).not.toBeInTheDocument();
    });

    it("marks unfinished database features as coming soon", async () => {
        renderPage();

        expect(await screen.findByText("Data Browser - Coming soon")).toBeVisible();
        expect(screen.getByText("Backups - Coming soon")).toBeVisible();
        expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    });

    it("keeps long connection strings in mobile-safe scroll containers", async () => {
        renderPage();

        const appCode = await screen.findByTestId("app-database-url-code");
        const localCode = screen.getByTestId("local-database-url-code");

        expect(appCode).toHaveClass("max-w-full", "overflow-x-auto", "whitespace-nowrap");
        expect(localCode).toHaveClass("max-w-full", "overflow-x-auto", "whitespace-nowrap");
    });
});
