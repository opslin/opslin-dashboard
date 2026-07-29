import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppsPage from "../page";
import { api } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/components/layout/header", () => ({
    Header: ({ title, description, actions }: {
        title: string;
        description?: string;
        actions?: ReactNode;
    }) => (
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
            getServers: vi.fn(),
            getAllApps: vi.fn(),
        },
    };
});

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <AppsPage />
        </QueryClientProvider>
    );
}

describe("AppsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getServers).mockResolvedValue([
            {
                id: "server-1",
                name: "Production VPS",
                ip: "10.0.0.10",
                status: "connected",
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ]);
        vi.mocked(api.getAllApps).mockResolvedValue([]);
    });

    it("shows an error state instead of an empty state when app listing fails", async () => {
        vi.mocked(api.getAllApps).mockRejectedValue(new Error("Internal server error"));

        renderPage();

        expect(await screen.findByText("Unable to load apps")).toBeInTheDocument();
        expect(screen.getByText("Internal server error")).toBeInTheDocument();
        expect(screen.queryByText("No apps yet")).not.toBeInTheDocument();
    });
});
