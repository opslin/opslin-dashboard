import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployProgress } from "../src/components/apps/deploy-progress";
import { OnboardingWizard } from "../src/components/onboarding/onboarding-wizard";
import { api } from "../src/lib/api";
import {
    appendBuildLogLines,
    applyDeployProgress,
    clampProgress,
    collectRecoverableDeployWarnings,
    createInitialDeployStages,
    isRecoverableDeployWarningLine,
    isSuccessfulOperationStatus,
    isTerminalDeploymentStatus,
    normalizeDeployProgressEvent,
} from "../src/lib/deploy-progress";
import { generateAppNameFromGitUrl } from "../src/lib/onboarding";
import { shouldBypassOnboarding } from "../src/lib/onboarding-routes";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

function renderWithQuery(ui: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe("Phase 02 dashboard logic", () => {
    beforeEach(() => {
        pushMock.mockReset();
        vi.restoreAllMocks();
        vi.spyOn(api, "getServers").mockResolvedValue([]);
        vi.spyOn(api, "getGitHubRepositories").mockResolvedValue({ repositories: [] });
        vi.spyOn(api, "getGitHubInstallUrl").mockReturnValue("http://localhost:4000/github/install");
    });

    it("renders all 4 onboarding step indicators", async () => {
        renderWithQuery(<OnboardingWizard />);

        await waitFor(() => {
            expect(screen.getByTestId("onboarding-step-server")).toBeInTheDocument();
        });
        expect(screen.getByTestId("onboarding-step-github")).toBeInTheDocument();
        expect(screen.getByTestId("onboarding-step-repo")).toBeInTheDocument();
        expect(screen.getByTestId("onboarding-step-deploy")).toBeInTheDocument();
    });

    it("keeps onboarding next disabled until the current step is valid", async () => {
        renderWithQuery(<OnboardingWizard />);

        const next = await screen.findByTestId("onboarding-next");
        expect(next).toBeDisabled();
    });

    it("parses deployment progress messages into stage events", () => {
        const parsed = normalizeDeployProgressEvent({
            type: "job_progress",
            phase: "building",
            percent: 55,
            line: "Step 4/7: npm ci",
            elapsedMs: 1200,
        });

        expect(parsed).toEqual({
            stage: "building",
            percentage: 55,
            description: "Step 4/7: npm ci",
            status: "running",
            elapsedMs: 1200,
        });
    });

    it("keeps recoverable failed deploy lines as warnings instead of terminal failures", () => {
        expect(isRecoverableDeployWarningLine("failed to configure registry cache importer")).toBe(true);
        expect(isRecoverableDeployWarningLine("healthcheck attempt 1 failed")).toBe(true);
        expect(isRecoverableDeployWarningLine("npm install failed")).toBe(false);

        expect(normalizeDeployProgressEvent({
            phase: "healthcheck",
            status: "failed",
            line: "healthcheck attempt 1 failed",
            percent: 82,
        })?.status).toBe("running");
    });

    it("classifies deploy modal status from terminal status, not raw failed text", () => {
        const logs = [
            "failed to configure registry cache importer",
            "healthcheck attempt 1 failed",
            "healthcheck threshold passed",
        ].join("\n");

        expect(collectRecoverableDeployWarnings(logs)).toHaveLength(2);
        expect(isSuccessfulOperationStatus("deploy", "running")).toBe(true);
        expect(isTerminalDeploymentStatus("running")).toBe(false);
        expect(isTerminalDeploymentStatus("error")).toBe(true);
    });

    it("clamps progress percentages to the 0-100 range", () => {
        expect(clampProgress(-10)).toBe(0);
        expect(clampProgress(42.4)).toBe(42);
        expect(clampProgress(130)).toBe(100);
    });

    it("buffers build log lines in order without retaining more than the cap", () => {
        const lines = Array.from({ length: 1005 }, (_, index) => `line-${index}`);
        const buffered = appendBuildLogLines([], lines, 1000);

        expect(buffered).toHaveLength(1000);
        expect(buffered[0]).toBe("line-5");
        expect(buffered.at(-1)).toBe("line-1004");
    });

    it("auto-generates app names from repository URLs", () => {
        expect(generateAppNameFromGitUrl("https://github.com/acme/my-app.git")).toBe("my-app");
        expect(generateAppNameFromGitUrl("https://github.com/acme/Image Generator")).toBe("image-generator");
    });

    it("updates the visual stage list from progress events", () => {
        const stages = applyDeployProgress(createInitialDeployStages(), {
            stage: "deploying",
            percentage: 75,
            description: "starting candidate container",
            status: "running",
            elapsedMs: 3300,
        });

        expect(stages.find((stage) => stage.key === "building")?.status).toBe("completed");
        expect(stages.find((stage) => stage.key === "deploying")?.status).toBe("running");
    });

    it("keeps real failed deploy progress red", () => {
        const stages = applyDeployProgress(createInitialDeployStages(), {
            stage: "building",
            percentage: 100,
            description: "npm install failed",
            status: "failed",
            elapsedMs: 1200,
        });

        expect(stages.find((stage) => stage.key === "building")?.status).toBe("error");
    });

    it("renders the deploy progress stepper", () => {
        render(<DeployProgress percentage={55} logLines={["npm ci", "npm run build"]} />);

        expect(screen.getByTestId("deploy-progress")).toBeInTheDocument();
        expect(screen.getByTestId("deploy-stage-building")).toBeInTheDocument();
    });

    it("renders warning-looking successful deploy logs in neutral terminal style", () => {
        render(
            <DeployProgress
                percentage={100}
                logLines={[
                    "failed to configure registry cache importer",
                    "healthcheck attempt 1 failed",
                    "Deployment completed",
                ]}
            />
        );

        expect(screen.queryByText(/Deployment failed/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    });

    it("bypasses onboarding for account, pricing, and docs routes", () => {
        expect(shouldBypassOnboarding("/settings")).toBe(true);
        expect(shouldBypassOnboarding("/settings/security")).toBe(true);
        expect(shouldBypassOnboarding("/pricing")).toBe(true);
        expect(shouldBypassOnboarding("/docs")).toBe(true);
        expect(shouldBypassOnboarding("/docs/billing")).toBe(true);
        expect(shouldBypassOnboarding("/apps")).toBe(false);
        expect(shouldBypassOnboarding("/servers")).toBe(false);
    });
});
