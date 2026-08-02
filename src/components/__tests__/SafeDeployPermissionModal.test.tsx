import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeDeployPermissionModal } from "../SafeDeployPermissionModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
    api: {
        createDeployGate: vi.fn(),
        setupSafeDeploy: vi.fn(),
    },
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

function renderModal(overrides: Partial<Parameters<typeof SafeDeployPermissionModal>[0]> = {}) {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
        <SafeDeployPermissionModal
            open
            appId="app-1"
            branch="main"
            repoFullName="acme/api"
            mode="safe"
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
            {...overrides}
        />
    );
    return { onOpenChange, onSuccess };
}

describe("SafeDeployPermissionModal", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.createDeployGate).mockResolvedValue({
            gateId: "gate-1",
            token: "token-1",
            webhookUrl: "https://example.com/webhook",
        });
        vi.mocked(api.setupSafeDeploy).mockResolvedValue({
            prUrl: "https://github.com/acme/api/pull/1",
            workflowPath: ".github/workflows/opslin-safe-deploy.yml",
            stack: "nodejs",
        });
    });

    it("defaults to GitHub Actions: creates the gate with testRunner github_actions and still runs workflow setup", async () => {
        const { onSuccess } = renderModal();

        expect(screen.getByRole("radio", { name: /Run tests on GitHub Actions/i })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("radio", { name: /Run tests on your own server/i })).toHaveAttribute("aria-checked", "false");

        fireEvent.click(screen.getByRole("button", { name: "Enable Safe Deployment" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(api.createDeployGate).toHaveBeenCalledWith("app-1", {
            branch: "main",
            mode: "safe",
            testRunner: "github_actions",
            repoFullName: "acme/api",
        });
        expect(api.setupSafeDeploy).toHaveBeenCalledWith("app-1", { branch: "main" });
    });

    it("selecting the agent runner creates the gate with testRunner agent and skips workflow-PR setup entirely", async () => {
        const { onSuccess } = renderModal();

        fireEvent.click(screen.getByRole("radio", { name: /Run tests on your own server/i }));
        expect(screen.getByRole("radio", { name: /Run tests on your own server/i })).toHaveAttribute("aria-checked", "true");

        // The one non-negotiable UX requirement: the resource-cost tradeoff must
        // be stated plainly next to the option, not buried in a tooltip.
        expect(screen.getByText(/costs real CPU\/RAM\/time on your VPS/i)).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: "Enable Safe Deployment" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(api.createDeployGate).toHaveBeenCalledWith("app-1", {
            branch: "main",
            mode: "safe",
            testRunner: "agent",
            repoFullName: "acme/api",
        });
        expect(api.setupSafeDeploy).not.toHaveBeenCalled();
    });

    it("switching back to GitHub Actions after selecting agent restores the workflow-PR setup call", async () => {
        const { onSuccess } = renderModal();

        fireEvent.click(screen.getByRole("radio", { name: /Run tests on your own server/i }));
        fireEvent.click(screen.getByRole("radio", { name: /Run tests on GitHub Actions/i }));
        fireEvent.click(screen.getByRole("button", { name: "Enable Safe Deployment" }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(api.setupSafeDeploy).toHaveBeenCalledWith("app-1", { branch: "main" });
        expect(api.createDeployGate).toHaveBeenCalledWith("app-1", expect.objectContaining({ testRunner: "github_actions" }));
    });
});
