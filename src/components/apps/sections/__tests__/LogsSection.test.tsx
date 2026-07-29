import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGS_REFETCH_INTERVAL_MS, LogsSection } from "../LogsSection";
import { api, type Server } from "@/lib/api";

vi.mock("@/components/logs/enhanced-log-viewer", () => ({
    EnhancedLogViewer: ({ lines }: { lines: string }) => (
        <div data-testid="enhanced-log-viewer">{lines}</div>
    ),
}));

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

function renderLogs(active: boolean, serverOverride: Partial<typeof server> = {}) {
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

    it("fetches logs when active and renders the log viewer", async () => {
        vi.mocked(api.getAppLogs).mockResolvedValue({
            id: "app-1",
            name: "Checkout API",
            logs: "line one\nline two",
            deployedAt: "2026-01-01T00:00:00.000Z",
            status: "running",
        });

        renderLogs(true);

        await waitFor(() => expect(api.getAppLogs).toHaveBeenCalledTimes(1));
        expect(await screen.findByTestId("enhanced-log-viewer")).toHaveTextContent("line one");
        expect(screen.getByText("Tail 200 lines")).toBeVisible();
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

        expect(await screen.findByText("No deployment logs available yet. Deploy the app to see logs.")).toBeVisible();
    });

    it("renders error and offline states", async () => {
        vi.mocked(api.getAppLogs).mockRejectedValue(new Error("agent offline"));

        renderLogs(true, { status: "disconnected", isLiveConnected: false });

        expect(await screen.findByText("Agent appears offline")).toBeVisible();
        expect(await screen.findByText("Unable to load app logs. Check the server agent connection and try again.")).toBeVisible();
    });
});
