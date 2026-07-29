import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewAppPage from "../page";
import { api } from "@/lib/api";

const routerMock = vi.hoisted(() => ({
    push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => routerMock,
    useSearchParams: () => new URLSearchParams("server=server-1"),
}));

vi.mock("@/components/pricing/upgrade-prompt", () => ({
    UpgradePrompt: () => null,
}));

vi.mock("@/hooks/usePlan", () => ({
    usePlan: () => ({
        plan: {
            name: "Free",
            features: {
                testing: {
                    virtualUsers: 0,
                    durationSeconds: 0,
                },
            },
        },
        can: () => true,
    }),
}));

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            ...actual.api,
            getServers: vi.fn(),
            getGitHubRepositories: vi.fn(),
            getGitHubInstallUrl: vi.fn(() => "https://github.com/apps/opslin/installations/new"),
            getCapacityAdvisory: vi.fn(),
            createApp: vi.fn(),
            deployApp: vi.fn(),
        },
    };
});

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <NewAppPage />
        </QueryClientProvider>
    );
}

async function advanceToConfirm(withGitUrl = "https://github.com/acme/frontend.git") {
    fireEvent.click(screen.getByTestId("source-git"));
    fireEvent.change(screen.getByTestId("manual-git-url"), { target: { value: withGitUrl } });
    fireEvent.click(screen.getByTestId("continue-button")); // source -> detect
    fireEvent.click(await screen.findByTestId("continue-button")); // detect -> env
    fireEvent.click(await screen.findByTestId("continue-button")); // env -> server
    fireEvent.click(await screen.findByTestId("continue-button")); // server -> confirm
}

describe("NewAppPage", () => {
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
        vi.mocked(api.getGitHubRepositories).mockResolvedValue({ repositories: [] });
        vi.mocked(api.getCapacityAdvisory).mockRejectedValue(
            Object.assign(new Error("no metrics"), { status: 404 })
        );
        vi.mocked(api.createApp).mockResolvedValue({
            id: "app-1",
            name: "frontend",
            status: "pending",
            createdAt: "2026-01-01T00:00:00.000Z",
        });
        vi.mocked(api.deployApp).mockResolvedValue({
            id: "app-1",
            name: "frontend",
            status: "deploying",
            message: "Deploy started",
            jobId: "job-1",
            deploymentId: "deployment-1",
            gitSha: "abc123",
        });
    });

    it("walks through all five steps and deploys with the selected buildpack", async () => {
        renderPage();

        // Step 1: source
        expect(screen.getByText("Choose your source")).toBeInTheDocument();
        expect(screen.getByTestId("continue-button")).toBeDisabled();
        fireEvent.click(screen.getByTestId("source-git"));
        fireEvent.change(screen.getByTestId("manual-git-url"), {
            target: { value: "https://github.com/acme/frontend.git" },
        });
        expect(screen.getByTestId("continue-button")).not.toBeDisabled();
        fireEvent.click(screen.getByTestId("continue-button"));

        // Step 2: detect — buildpack override is a first-class field here
        expect(await screen.findByRole("heading", { name: "Runtime & build" })).toBeInTheDocument();
        const buildpackSelect = screen.getByLabelText("Buildpack Override");
        expect(within(buildpackSelect).getByText("Auto-detect")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("continue-button"));

        // Step 3: env vars
        expect(await screen.findByText("Environment variables")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("continue-button"));

        // Step 4: server — capacity card should render for the pre-selected server
        expect(await screen.findByText("Choose a server")).toBeInTheDocument();
        await waitFor(() => expect(api.getCapacityAdvisory).toHaveBeenCalledWith("server-1"));
        fireEvent.click(screen.getByTestId("continue-button"));

        // Step 5: confirm
        expect(await screen.findByRole("heading", { name: "Review & launch" })).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("deploy-button"));

        await waitFor(() => {
            expect(api.createApp).toHaveBeenCalledWith("server-1", expect.objectContaining({
                gitUrl: "https://github.com/acme/frontend.git",
                branch: "main",
            }));
        });
        expect(api.deployApp).toHaveBeenCalledWith("server-1", "app-1");
        expect(routerMock.push).toHaveBeenCalledWith("/apps/app-1");
    });

    it("sends health check mode and path from the confirm step's advanced options", async () => {
        renderPage();
        await advanceToConfirm("https://github.com/acme/api.git");

        fireEvent.click(await screen.findByText("Advanced options"));
        const modeSelect = screen.getByLabelText("Health Check Mode");
        expect(within(modeSelect).getByText("Auto (recommended)")).toBeInTheDocument();

        fireEvent.change(screen.getByTestId("health-check-path"), {
            target: { value: " /ready " },
        });
        fireEvent.click(screen.getByTestId("deploy-button"));

        await waitFor(() => {
            expect(api.createApp).toHaveBeenCalledWith("server-1", expect.objectContaining({
                healthCheckMode: "auto",
                healthPath: "/ready",
            }));
        });
    });

    it("lets the back button return to a previous step without losing entered data", async () => {
        renderPage();
        fireEvent.click(screen.getByTestId("source-git"));
        fireEvent.change(screen.getByTestId("manual-git-url"), {
            target: { value: "https://github.com/acme/frontend.git" },
        });
        fireEvent.click(screen.getByTestId("continue-button"));
        expect(await screen.findByRole("heading", { name: "Runtime & build" })).toBeInTheDocument();

        fireEvent.click(screen.getByText("Back"));
        expect(await screen.findByRole("heading", { name: "Choose your source" })).toBeInTheDocument();
        expect(screen.getByTestId("manual-git-url")).toHaveValue("https://github.com/acme/frontend.git");
    });
});
