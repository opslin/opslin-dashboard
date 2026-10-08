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
            getServerJobStatus: vi.fn(),
            triggerAutoDeploy: vi.fn(),
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

async function reachReview(gitUrl = "https://github.com/acme/frontend.git") {
    fireEvent.mouseDown(screen.getByTestId("source-git"), { button: 0 });
    fireEvent.change(await screen.findByTestId("manual-git-url"), { target: { value: gitUrl } });
    fireEvent.click(screen.getByTestId("continue-button"));
    await screen.findByRole("heading", { name: "Looks good. Ready to go live?" });
}

describe("NewAppPage (two-step deploy)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getServers).mockResolvedValue([
            { id: "server-1", name: "Production VPS", ip: "10.0.0.10", status: "connected", createdAt: "2026-01-01T00:00:00.000Z" },
        ]);
        vi.mocked(api.getGitHubRepositories).mockResolvedValue({
            repositories: [
                {
                    id: 1, name: "api", fullName: "acme/api", owner: "acme", private: false,
                    htmlUrl: "https://github.com/acme/api", cloneUrl: "https://github.com/acme/api.git", sshUrl: "git@github.com:acme/api.git",
                    defaultBranch: "develop", language: "TypeScript", updatedAt: "2026-01-02T00:00:00.000Z", installationId: "inst-1", installationAccount: "acme",
                },
            ],
        });
        vi.mocked(api.createApp).mockResolvedValue({ id: "app-1", name: "frontend", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" });
        vi.mocked(api.deployApp).mockResolvedValue({
            id: "app-1", name: "frontend", status: "deploying", message: "Deploy started", jobId: "job-1", deploymentId: "deployment-1", gitSha: "abc123",
        });
        vi.mocked(api.triggerAutoDeploy).mockResolvedValue({ jobId: "job-ai-1", serverId: "server-1" });
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "RUNNING",
            progress: { phase: "build", percent: 62, message: "compiling production bundle", status: "running" },
        });
    });

    it("starts on the import step with three ways to bring code and a disabled Continue for Git URL", async () => {
        renderPage();
        expect(screen.getByRole("heading", { name: "Let's deploy your project" })).toBeInTheDocument();
        expect(screen.getByTestId("source-github")).toBeInTheDocument();
        expect(screen.getByTestId("source-upload")).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByTestId("source-git"), { button: 0 });
        expect(await screen.findByTestId("continue-button")).toBeDisabled();
        fireEvent.change(screen.getByTestId("manual-git-url"), { target: { value: "https://github.com/acme/frontend.git" } });
        expect(screen.getByTestId("continue-button")).not.toBeDisabled();
    });

    it("deploys a Git URL in two steps with the server picked automatically", async () => {
        renderPage();
        await reachReview();

        // The one connected server is chosen for the person and there is nothing to configure.
        expect(await screen.findByTestId("deploy-server")).toHaveTextContent("Production VPS");
        expect(screen.queryByText("Choose a server")).not.toBeInTheDocument();
        expect(screen.queryByText("Runtime & build")).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => {
            expect(api.createApp).toHaveBeenCalledWith("server-1", expect.objectContaining({
                name: "frontend",
                gitUrl: "https://github.com/acme/frontend.git",
                branch: "main",
            }));
        });
        expect(api.deployApp).toHaveBeenCalledWith("server-1", "app-1");
        expect(routerMock.push).toHaveBeenCalledWith("/apps/app-1");
    });

    it("sends health check mode and path from Optional settings", async () => {
        renderPage();
        await reachReview("https://github.com/acme/api.git");

        fireEvent.click(screen.getByRole("button", { name: /Optional settings/ }));
        const modeSelect = await screen.findByLabelText("Health Check Mode");
        expect(within(modeSelect).getByText("Auto (recommended)")).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("health-check-path"), { target: { value: " /ready " } });
        fireEvent.click(screen.getByTestId("deploy-button"));

        await waitFor(() => {
            expect(api.createApp).toHaveBeenCalledWith("server-1", expect.objectContaining({ healthCheckMode: "auto", healthPath: "/ready" }));
        });
    });

    it("keeps the project name editable and lets Change return to the import step with data intact", async () => {
        renderPage();
        await reachReview();
        const nameInput = screen.getByLabelText("Project name");
        expect(nameInput).toHaveValue("frontend");
        fireEvent.change(nameInput, { target: { value: "my-site" } });

        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        expect(await screen.findByRole("heading", { name: "Let's deploy your project" })).toBeInTheDocument();
        expect(screen.getByTestId("manual-git-url")).toHaveValue("https://github.com/acme/frontend.git");
    });

    it("lists GitHub repositories and one click on a repo opens the review step", async () => {
        renderPage();
        fireEvent.change(await screen.findByLabelText("Search your repositories"), { target: { value: "api" } });
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        expect(await screen.findByRole("heading", { name: "Looks good. Ready to go live?" })).toBeInTheDocument();
        expect(screen.getByText("acme/api")).toBeInTheDocument();
        expect(screen.getByText("develop")).toBeInTheDocument();
        expect(screen.getByText("Dockerfile written by Opslin AI")).toBeInTheDocument();
    });

    it("deploys a GitHub repo with Opslin's AI and shows live progress", async () => {
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        fireEvent.click(await screen.findByTestId("deploy-button"));

        await waitFor(() => {
            expect(api.triggerAutoDeploy).toHaveBeenCalledWith("server-1", expect.objectContaining({
                gitUrl: "https://github.com/acme/api.git",
                branch: "develop",
                githubInstallationId: "inst-1",
                appNamePrefix: "api",
            }));
        });
        expect(api.createApp).not.toHaveBeenCalled();
        expect(await screen.findByText("Deploying api…")).toBeInTheDocument();
        expect(await screen.findByText("Opslin AI is writing your Dockerfile")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("62%")).toBeInTheDocument());
    });

    it("shows the live link and next actions when the AI deploy finishes", async () => {
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "COMPLETED",
            result: { units: [], primaryUrl: "https://api.example.com", primaryAppId: "app-9", deployGroupId: null },
        });
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        fireEvent.click(await screen.findByTestId("deploy-button"));

        expect(await screen.findByText("api is live")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /api\.example\.com/ })).toHaveAttribute("href", "https://api.example.com");
        fireEvent.click(screen.getByRole("button", { name: "Open app" }));
        expect(routerMock.push).toHaveBeenCalledWith("/apps/app-9");
    });
});
