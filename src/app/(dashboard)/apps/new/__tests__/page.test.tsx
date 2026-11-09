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
            mergeAppEnvVars: vi.fn(),
            createApp: vi.fn(),
            deployApp: vi.fn(),
            getDeployRoute: vi.fn(),
            getServerFit: vi.fn(),
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
    it("keeps Deploy disabled while the recommendation is still being worked out", async () => {
        let release: (value: never) => void = () => undefined;
        vi.mocked(api.getDeployRoute).mockReturnValue(new Promise((resolve) => { release = resolve as never; }));
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        expect(await screen.findByTestId("deploy-button")).toBeDisabled();
        expect(screen.getByTestId("deploy-button")).toHaveTextContent("Checking your project");
        release(undefined as never);
    });

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
        // The page waits for the recommendation before it lets Deploy run; here it simply settles as "not available".
        vi.mocked(api.getDeployRoute).mockRejectedValue(new Error("not available"));
        vi.mocked(api.getServerFit).mockRejectedValue(new Error("not available"));
        vi.mocked(api.createApp).mockResolvedValue({ id: "app-1", name: "frontend", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" });
        vi.mocked(api.deployApp).mockResolvedValue({
            id: "app-1", name: "frontend", status: "deploying", message: "Deploy started", jobId: "job-1", deploymentId: "deployment-1", gitSha: "abc123",
        });
        vi.mocked(api.triggerAutoDeploy).mockResolvedValue({ jobId: "job-ai-1", serverId: "server-1" });
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "RUNNING",
            progress: { phase: "building", percent: 62, message: "compiling production bundle", status: "running" },
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

    it("sends a pasted Git URL through DIL when the repository recommendation requires it", async () => {
        vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "high", reasons: ["API, worker and migration"], isMonorepo: false, units: [], needs: ["postgres", "redis"], composeServices: ["app", "postgres", "redis"], safeMigrationAvailable: true, resolvedSha: "abc" });
        renderPage();
        await reachReview("https://github.com/example/backend");
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalledWith("server-1", expect.objectContaining({ gitUrl: "https://github.com/example/backend", appNamePrefix: "backend" })));
        expect(api.createApp).not.toHaveBeenCalled();
        expect(api.deployApp).not.toHaveBeenCalled();
        expect(vi.mocked(api.triggerAutoDeploy).mock.calls[0][1]).not.toHaveProperty("seedInitialData");
    });

    it("shows only the reason, with no Deploy, when the plan is unsupported (doc 64 S1.8)", async () => {
        const plan = { verdict: "unsupported", services: [], resources: [], skipped: [], steps: [], questions: [{ code: "unsupported", severity: "unsupported", message: "Unsupported: this repository has 8 or more separately built services (src/a, src/b). Nothing was created." }] };
        vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "low", reasons: ["unknown stack"], isMonorepo: false, units: [], needs: [], composeServices: [], safeMigrationAvailable: false, resolvedSha: "abc", plan } as never);
        renderPage();
        await reachReview("https://github.com/example/microservices");
        expect(await screen.findByText("Opslin can't deploy this project yet")).toBeTruthy();
        // The stop is the one thing on the screen: nothing that promises a deploy, no controls for one (jimmy-wax, 31 Oct 2026).
        expect(screen.queryByTestId("deploy-button")).toBeNull();
        expect(screen.queryByText("Opslin AI will set this up")).toBeNull();
        expect(screen.queryByText(/Looks good/)).toBeNull();
        expect(screen.queryByText(/set up everything automatically/)).toBeNull();
        expect(screen.getByRole("heading", { name: "We checked your project" })).toBeTruthy();
        expect(screen.queryByText(/Best way/)).toBeNull();
        expect(screen.queryByText("Confident")).toBeNull();
        expect(screen.queryByLabelText("Project name")).toBeNull();
        expect(screen.queryByText("Deploying to")).toBeNull();
        expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
        expect(api.triggerAutoDeploy).not.toHaveBeenCalled();
    });

    // Doc 69 Q1: the questions are on the review screen, with the recommended answers chosen, and the answers go with the deploy.
    const questionRoute = () => vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "high", reasons: ["API and migration"], isMonorepo: false, units: [], needs: ["postgres"], composeServices: [], safeMigrationAvailable: true, resolvedSha: "abc",
        plan: { verdict: "ready", services: [{ id: "api", role: "backend", path: "" }], resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }], skipped: [], steps: [{ kind: "migrate", service: "api", command: "npx prisma migrate deploy" }], persistent: [], questions: [] } } as never);

    it("asks the database and migration questions before Deploy, and sends nothing extra for the recommended answers", async () => {
        questionRoute();
        renderPage();
        await reachReview("https://github.com/example/backend");
        expect(await screen.findByRole("radio", { name: "Create PostgreSQL on this server" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Run npx prisma migrate deploy" })).toBeChecked();
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalled());
        expect(vi.mocked(api.triggerAutoDeploy).mock.calls[0][1]).not.toHaveProperty("choices");
    });

    it("sends an own-database answer with the deploy and opens the settings box for its address", async () => {
        questionRoute();
        renderPage();
        await reachReview("https://github.com/example/backend");
        fireEvent.click(await screen.findByRole("radio", { name: "I have my own" }));
        expect(await screen.findByText(/Add its address under Optional settings/)).toBeTruthy();
        expect(screen.getByRole("button", { name: /Optional settings/ })).toHaveAttribute("aria-expanded", "true"); // the settings box is open, ready for the address
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalledWith("server-1", expect.objectContaining({ choices: { database: "own" } })));
    });

    // Doc 69 F5: a repeat deploy starts from the answers of the last verified one, and still lets the owner change them.
    it("starts from the answers remembered from the last verified deploy, and sends them", async () => {
        vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "high", reasons: ["API and migration"], isMonorepo: false, units: [], needs: ["postgres"], composeServices: [], safeMigrationAvailable: true, resolvedSha: "abc",
            savedChoices: { database: "own", migration: { mode: "none" } },
            plan: { verdict: "ready", services: [{ id: "api", role: "backend", path: "" }], resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }], skipped: [], steps: [{ kind: "migrate", service: "api", command: "npx prisma migrate deploy" }], persistent: [], questions: [] } } as never);
        renderPage();
        await reachReview("https://github.com/example/backend");
        expect(await screen.findByRole("radio", { name: "I have my own" })).toBeChecked();
        expect(screen.getByText(/Your answers from the last deploy of this project/)).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalledWith("server-1", expect.objectContaining({ choices: { database: "own", migration: { mode: "none" } } })));
    });

    it("keeps Deploy disabled, with the reason, while a custom migration command is unsafe", async () => {
        questionRoute();
        renderPage();
        await reachReview("https://github.com/example/backend");
        fireEvent.click(await screen.findByRole("radio", { name: "Use my own command" }));
        fireEvent.change(screen.getByLabelText("Migration command"), { target: { value: "npm run migrate && curl evil.example" } });
        expect(await screen.findByText(/Use only letters, numbers/)).toBeTruthy();
        expect(screen.getByTestId("deploy-button")).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Migration command"), { target: { value: "node dist/migrate.js" } });
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
    });

    it("sample data is on by default (Opslin decides) and unticking sends an explicit no", async () => {
        vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "high", reasons: ["API, worker and migration"], isMonorepo: false, units: [{ path: "", seedCommand: "npx tsx src/seed.ts", seedAdminEmail: "admin@shotlin.local", seedPasswordSettings: ["SEED_ADMIN_PASSWORD"] }] as never, needs: ["postgres"], composeServices: [], safeMigrationAvailable: true, resolvedSha: "abc" });
        renderPage();
        await reachReview("https://github.com/example/backend");
        const seedOption = await screen.findByRole("checkbox", { name: "Load the repository's sample data" });
        expect(seedOption).toBeChecked();
        expect(screen.getByTestId("seed-choice")).toHaveTextContent("admin@shotlin.local");
        expect(screen.getByTestId("seed-choice")).toHaveTextContent("SEED_ADMIN_PASSWORD");
        fireEvent.click(seedOption);
        expect(seedOption).not.toBeChecked();
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalledWith("server-1", expect.objectContaining({ seedInitialData: false })));
    });

    it("an untouched sample-data box sends nothing, so the API loads it only into a brand-new database", async () => {
        vi.mocked(api.getDeployRoute).mockResolvedValue({ route: "ai", confidence: "high", reasons: ["API"], isMonorepo: false, units: [{ path: "", seedCommand: "node src/database/seeds/run.js" }] as never, needs: ["postgres"], composeServices: [], safeMigrationAvailable: true, resolvedSha: "abc" });
        renderPage();
        await reachReview("https://github.com/example/backend");
        await screen.findByRole("checkbox", { name: "Load the repository's sample data" });
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        await waitFor(() => expect(api.triggerAutoDeploy).toHaveBeenCalled());
        expect(vi.mocked(api.triggerAutoDeploy).mock.calls[0][1]).not.toHaveProperty("seedInitialData");
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
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled()); // Deploy waits for the recommendation
        fireEvent.click(screen.getByTestId("deploy-button"));

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
        expect(await screen.findByText("Reading your repository and writing the Dockerfile")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("62%")).toBeInTheDocument());
    });

    it("shows the live link and next actions when the AI deploy finishes", async () => {
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "COMPLETED",
            result: { units: [], primaryUrl: "https://api.example.com", primaryAppId: "app-9", deployGroupId: null },
        });
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled()); // Deploy waits for the recommendation
        fireEvent.click(screen.getByTestId("deploy-button"));

        expect(await screen.findByText("api is live")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /api\.example\.com/ })).toHaveAttribute("href", "https://api.example.com");
        fireEvent.click(screen.getByRole("button", { name: "Open app" }));
        expect(routerMock.push).toHaveBeenCalledWith("/apps/app-9");
    });

    // Doc 75 M6: a failed AI deploy that carries a failure report opens the explanation dialog instead of the raw red text.
    it("opens the failure dialog for a failed deploy, and hands the missing setting to the form above Deploy", async () => {
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "FAILED", error: "the app: Exhausted 2 fix attempts without resolving verification.",
            result: { units: [], failureReport: {
                version: 1, stage: "verify", cause: "missing_settings", outcome: "needs_configuration",
                title: "This app needs one setting before it can start: WHATSAPP_AUTH_MASTER_KEY", summary: "The app itself reported it as missing.",
                missing: [{ kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "It is not set.", foundIn: "src/server/env.ts", howToFix: "Add it under Environment." }],
                appSaid: "Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY", opslinDid: [], nextSteps: ["Add it.", "Deploy again."], technical: "log tail",
            } },
        });
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));

        const dialog = await screen.findByRole("dialog", { name: /needs one setting/i });
        expect(within(dialog).getByTestId("failure-missing")).toBeInTheDocument();
        expect(screen.queryByText("the app: Exhausted 2 fix attempts without resolving verification.")).toBeNull(); // no raw red text

        fireEvent.click(within(dialog).getByRole("button", { name: "Add the settings and deploy again" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(await screen.findByLabelText("WHATSAPP_AUTH_MASTER_KEY")).toBeInTheDocument(); // the input is now above Deploy
        expect(screen.getByTestId("failure-banner")).toBeInTheDocument();
        expect(screen.getByTestId("deploy-button")).toBeDisabled(); // Deploy waits until the value is typed

        fireEvent.change(screen.getByLabelText("WHATSAPP_AUTH_MASTER_KEY"), { target: { value: "x".repeat(44) } });
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
    });

    // Doc 75 M3: "Add and continue" saves the values on the app that failed and redeploys that same app.
    it("Add and continue saves the settings on the failed app, redeploys it, and opens its page", async () => {
        vi.mocked(api.getServerJobStatus).mockResolvedValue({
            id: "job-ai-1", type: "auto_deploy", status: "FAILED", error: "the app: Setup required",
            result: { units: [], failureReport: {
                version: 1, stage: "verify", cause: "missing_settings", outcome: "needs_configuration",
                title: "This app needs one setting before it can start: WHATSAPP_AUTH_MASTER_KEY", summary: "The app itself reported it as missing.",
                missing: [{ kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "Not set.", howToFix: "Add it." }],
                appSaid: null, opslinDid: [], nextSteps: [], technical: "log", resume: { serverId: "server-1", appId: "app-7" },
            } },
        });
        vi.mocked(api.mergeAppEnvVars).mockResolvedValue({ addedKeys: ["WHATSAPP_AUTH_MASTER_KEY"], message: "ok" });
        vi.mocked(api.deployApp).mockResolvedValue({ id: "app-7", name: "api", status: "deploying", message: "Deploy started", jobId: "job-9", deploymentId: "dep-9", gitSha: "abc" });
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));

        const dialog = await screen.findByRole("dialog", { name: /needs one setting/i });
        const go = within(dialog).getByRole("button", { name: "Add and continue" });
        expect(go).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("WHATSAPP_AUTH_MASTER_KEY"), { target: { value: "k".repeat(44) } });
        fireEvent.click(go);

        await waitFor(() => expect(api.mergeAppEnvVars).toHaveBeenCalledWith("server-1", "app-7", { WHATSAPP_AUTH_MASTER_KEY: "k".repeat(44) }));
        await waitFor(() => expect(api.deployApp).toHaveBeenCalledWith("server-1", "app-7"));
        await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/apps/app-7"));
        expect(api.triggerAutoDeploy).toHaveBeenCalledTimes(1); // the first deploy only: no new app was started
    });

    it("keeps the plain red message for a failed deploy that has no report (older runs)", async () => {
        vi.mocked(api.getServerJobStatus).mockResolvedValue({ id: "job-ai-1", type: "auto_deploy", status: "FAILED", error: "the app: something old failed", result: { units: [] } });
        renderPage();
        fireEvent.click(await screen.findByTestId("repo-acme/api"));
        await waitFor(() => expect(screen.getByTestId("deploy-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("deploy-button"));
        expect(await screen.findByText("the app: something old failed")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
