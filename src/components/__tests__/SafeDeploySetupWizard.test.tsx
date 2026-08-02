import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeDeploySetupWizard } from "../SafeDeploySetupWizard";
import type { App, DeployGateSummary } from "@/lib/api";

const app: Pick<App, "id" | "gitUrl" | "githubInstallationId" | "branch"> = {
    id: "app-1",
    gitUrl: "https://github.com/acme/api.git",
    githubInstallationId: "installation-1",
    branch: "main",
};

function gate(overrides: Partial<DeployGateSummary> = {}): DeployGateSummary {
    return {
        id: "gate-1",
        appId: "app-1",
        organizationId: "org-1",
        provider: "github",
        repoFullName: "acme/api",
        branch: "main",
        mode: "safe",
        testRunner: "github_actions",
        workflowPath: ".github/workflows/opslin-safe-deploy.yml",
        workflowBranch: "opslin/setup-safe-deploy/app-1/20260503-120000",
        workflowPrUrl: "https://github.com/acme/api/pull/1",
        workflowPrState: "open",
        tokenLastUsedAt: null,
        enabled: true,
        disabledReason: null,
        secretsInjected: true,
        createdById: "user-1",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
        lastCiRun: null,
        lastDeploymentStatus: null,
        lastDeployment: null,
        ...overrides,
    };
}

describe("SafeDeploySetupWizard", () => {
    it("shows ready state when the workflow is installed", () => {
        render(<SafeDeploySetupWizard app={app} gate={gate({
            workflowPrState: "merged",
            setupStatus: "ready",
            workflowInstalled: true,
            workflowInstalledBranch: "main",
        })} />);

        expect(screen.getByText("PR Merged")).toBeVisible();
        expect(screen.getByText("Workflow installed on main")).toBeVisible();
        expect(screen.getAllByText("READY").length).toBeGreaterThan(0);
    });

    it("shows workflow missing as a failed terminal state instead of progress", () => {
        render(<SafeDeploySetupWizard app={app} gate={gate({
            workflowPrState: "merged",
            setupStatus: "pr_merged_workflow_missing",
            setupMessage: "Workflow file is missing on the deploy branch. Re-run Safe Deploy setup.",
            workflowInstalled: false,
            workflowInstalledBranch: null,
        })} />);

        expect(screen.getByText("Workflow file is missing on the deploy branch. Re-run Safe Deploy setup.")).toBeVisible();
        expect(screen.getByText("PR MERGED WORKFLOW MISSING")).toBeVisible();
    });

    it("shows closed PR state without a loading prompt", () => {
        render(<SafeDeploySetupWizard app={app} gate={gate({
            workflowPrState: "closed",
            setupStatus: "pr_closed",
            setupMessage: "Setup PR was closed without merge. Re-run setup.",
        })} />);

        expect(screen.getByText("Setup PR was closed without merge. Re-run setup.")).toBeVisible();
        expect(screen.getByText("PR CLOSED")).toBeVisible();
    });

    it("keeps the setup PR link visible while the PR is open", () => {
        render(<SafeDeploySetupWizard app={app} gate={gate({
            setupStatus: "pr_open",
            workflowInstalled: false,
        })} />);

        expect(screen.getByRole("link", { name: /Open/i })).toHaveAttribute("href", "https://github.com/acme/api/pull/1");
        expect(screen.getByText("Merge the setup PR to activate CI gating")).toBeVisible();
    });
});
