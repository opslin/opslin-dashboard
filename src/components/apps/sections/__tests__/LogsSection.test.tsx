import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGS_REFETCH_INTERVAL_MS, LogsSection } from "../LogsSection";
import { api, type Server } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            getAppLogs: vi.fn(),
        },
    };
});

const server: Pick<Server, "id" | "status" | "isLiveConnected" | "lastSeenAt"> = {
    id: "server-1",
    status: "connected",
    isLiveConnected: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
};

function renderLogs(active: boolean, serverOverride: Partial<typeof server> = {}, buildLogs?: string) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <LogsSection
                appId="app-1"
                appName="Checkout API"
                server={{ ...server, ...serverOverride }}
                active={active}
                buildLogs={buildLogs}
            />
        </QueryClientProvider>
    );
}

describe("LogsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not fetch before the Logs section is active", () => {
        renderLogs(false);

        expect(api.getAppLogs).not.toHaveBeenCalled();
    });

    it("fetches logs when active and renders parsed lines with levels", async () => {
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Checkout API",
            logs: "2026-01-01T14:31:42Z INFO GET /api/products 200 in 84ms\n14:31:40 WARN Rate limit reached\n14:31:33 ERROR Failed to load inventory",
            deployedAt: "2026-01-01T00:00:00.000Z",
            status: "running",
        });

        renderLogs(true);

        await waitFor(() => expect(api.getAppLogs).toHaveBeenCalledTimes(1));
        expect(await screen.findByText("GET /api/products 200 in 84ms")).toBeVisible();
        expect(screen.getByText("WARN")).toBeVisible();
        expect(screen.getByText("Failed to load inventory")).toBeVisible();
        expect(screen.getByText(/Showing last 3 lines/)).toBeVisible();
    });

    it("filters by search and level, and switches to build output", async () => {
        vi.mocked(api.getAppLogs).mockResolvedValue({ id: "app-1", name: "Checkout API", logs: "INFO hello world\nERROR it broke", status: "running" });

        renderLogs(true, {}, "INFO cloning repo");

        expect(await screen.findByText("hello world")).toBeVisible();
        fireEvent.change(screen.getByLabelText("Search logs"), { target: { value: "broke" } });
        expect(screen.queryByText("hello world")).not.toBeInTheDocument();
        expect(screen.getByText("it broke")).toBeVisible();
        fireEvent.change(screen.getByLabelText("Search logs"), { target: { value: "" } });

        fireEvent.click(screen.getByRole("button", { name: "build" }));
        expect(await screen.findByText("cloning repo")).toBeVisible();
    });

    it("pauses live updates", async () => {
        vi.mocked(api.getAppLogs).mockResolvedValue({ id: "app-1", name: "Checkout API", logs: "INFO hello", status: "running" });

        renderLogs(true);

        expect(await screen.findByText("Live")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
        expect(screen.queryByText("Live")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Resume/i })).toBeVisible();
    });

    it("uses safe polling and no one-second refresh interval", () => {
        expect(LOGS_REFETCH_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
        expect(LOGS_REFETCH_INTERVAL_MS).not.toBe(1_000);
    });

    it("renders a clear empty state", async () => {
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Checkout API",
            logs: "",
            status: "running",
        });

        renderLogs(true);

        expect(await screen.findByText("No logs yet. Deploy the app to see output here.")).toBeVisible();
    });

    it("renders error and offline states", async () => {
        vi.mocked(api.getAppLogs).mockRejectedValue(new Error("agent offline"));

        renderLogs(true, { status: "disconnected", isLiveConnected: false });

        expect(await screen.findByText(/The server is offline/)).toBeVisible();
        expect(await screen.findByText(/Couldn't load logs/)).toBeVisible();
    });
});
