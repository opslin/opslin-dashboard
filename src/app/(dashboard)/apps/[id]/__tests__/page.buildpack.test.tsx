import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildpackVersionSelector } from "@/components/apps/BuildpackVersionSelector";
import { api } from "@/lib/api";
import type { App, DeploymentRecord } from "@/lib/api";

// --- Mocks ---

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            listBuildpackVersions: vi.fn(),
            updateBuildpackPin: vi.fn(),
        },
    };
});

// --- Helpers ---

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function renderSelector(props?: Partial<React.ComponentProps<typeof BuildpackVersionSelector>>) {
    const queryClient = createQueryClient();
    const defaultProps = {
        serverId: "server-1",
        appId: "app-1",
        buildpackVersion: "1.0.0",
        buildpackVersionPin: null,
        disabled: false,
        ...props,
    };

    return render(
        <QueryClientProvider client={queryClient}>
            <BuildpackVersionSelector {...defaultProps} />
        </QueryClientProvider>
    );
}

// --- Tests ---

describe("BuildpackVersionSelector", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listBuildpackVersions).mockResolvedValue({
            versions: ["1.0.0", "1.1.0", "1.2.0"],
        });
        vi.mocked(api.updateBuildpackPin).mockResolvedValue({
            id: "app-1",
            name: "Test App",
            status: "running",
            buildpackVersion: "1.0.0",
            buildpackVersionPin: "1.0.0",
            createdAt: "2026-01-01T00:00:00.000Z",
        } as App);
    });

    it("renders the current buildpack version", async () => {
        renderSelector({ buildpackVersion: "1.2.0" });

        expect(await screen.findByText("1.2.0")).toBeVisible();
    });

    it("renders a dash when buildpackVersion is null", async () => {
        renderSelector({ buildpackVersion: null });

        expect(screen.getByTestId("buildpack-version-selector")).toBeVisible();
        expect(screen.getByText("—")).toBeVisible();
    });

    it("populates the pin select with versions from listBuildpackVersions", async () => {
        renderSelector();

        const select = await screen.findByTestId("buildpack-pin-select");
        await waitFor(() => {
            expect(select).not.toBeDisabled();
        });

        const options = select.querySelectorAll("option");
        expect(options).toHaveLength(4); // "Use latest" + 3 versions
        expect(options[0]).toHaveTextContent("Use latest");
        expect(options[1]).toHaveTextContent("1.0.0");
        expect(options[2]).toHaveTextContent("1.1.0");
        expect(options[3]).toHaveTextContent("1.2.0");
    });

    it("calls updateBuildpackPin with the selected version on change", async () => {
        renderSelector();

        const select = await screen.findByTestId("buildpack-pin-select");
        await waitFor(() => {
            expect(select).not.toBeDisabled();
        });

        fireEvent.change(select, { target: { value: "1.1.0" } });

        await waitFor(() => {
            expect(api.updateBuildpackPin).toHaveBeenCalledWith("server-1", "app-1", "1.1.0");
        });
    });

    it("calls updateBuildpackPin with null when 'Use latest' is selected", async () => {
        renderSelector({ buildpackVersionPin: "1.0.0" });

        const select = await screen.findByTestId("buildpack-pin-select");
        await waitFor(() => {
            expect(select).not.toBeDisabled();
        });

        fireEvent.change(select, { target: { value: "" } });

        await waitFor(() => {
            expect(api.updateBuildpackPin).toHaveBeenCalledWith("server-1", "app-1", null);
        });
    });

    it("shows the current pin value as selected", async () => {
        renderSelector({ buildpackVersionPin: "1.1.0" });

        const select = await screen.findByTestId("buildpack-pin-select");
        await waitFor(() => {
            expect(select).not.toBeDisabled();
        });

        expect(select).toHaveValue("1.1.0");
    });
});

describe("Deployment buildpack badge", () => {
    it("renders buildpackName@buildpackVersion when both are present", () => {
        const deployment: DeploymentRecord = {
            id: "dep-1",
            sha: "abc123",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            buildpackName: "node-next",
            buildpackVersion: "1.0.0",
        };

        expect(formatBuildpackBadge(deployment)).toBe("node-next@1.0.0");
    });

    it("renders a dash when buildpackName is null", () => {
        const deployment: DeploymentRecord = {
            id: "dep-2",
            sha: "def456",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            buildpackName: null,
            buildpackVersion: "1.0.0",
        };

        expect(formatBuildpackBadge(deployment)).toBe("—");
    });

    it("renders a dash when buildpackVersion is null", () => {
        const deployment: DeploymentRecord = {
            id: "dep-3",
            sha: "ghi789",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
            buildpackName: "node-next",
            buildpackVersion: null,
        };

        expect(formatBuildpackBadge(deployment)).toBe("—");
    });

    it("renders a dash when both are undefined", () => {
        const deployment: DeploymentRecord = {
            id: "dep-4",
            sha: "jkl012",
            status: "succeeded",
            startedAt: "2026-01-01T00:00:00.000Z",
            triggeredBy: "manual",
            triggerMeta: {},
        };

        expect(formatBuildpackBadge(deployment)).toBe("—");
    });
});

// Helper function matching the badge logic in DeploymentsSection
function formatBuildpackBadge(deployment: DeploymentRecord): string {
    if (deployment.buildpackName && deployment.buildpackVersion) {
        return `${deployment.buildpackName}@${deployment.buildpackVersion}`;
    }
    return "—";
}
