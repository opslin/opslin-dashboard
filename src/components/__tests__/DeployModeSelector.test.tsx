import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployModeSelector } from "../DeployModeSelector";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
    api: {
        updateDeployGate: vi.fn(),
        setupSafeDeploy: vi.fn(),
        createDeployGate: vi.fn(),
    },
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/hooks/usePlan", () => ({
    usePlan: () => ({ can: () => true, loading: false }),
}));

function renderSelector(overrides: Partial<Parameters<typeof DeployModeSelector>[0]> = {}) {
    return render(
        <DeployModeSelector
            appId="app-1"
            branch="main"
            repoFullName="acme/api"
            currentMode="safe"
            hasSafeDeployGate
            gateId="gate-1"
            currentTestRunner="github_actions"
            {...overrides}
        />
    );
}

describe("DeployModeSelector — test runner row for an existing gate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.updateDeployGate).mockResolvedValue({
            gate: { setupStatus: "ready" } as never,
        });
    });

    it("does not render the test runner row when there is no gate yet", () => {
        renderSelector({ hasSafeDeployGate: false, gateId: undefined, currentTestRunner: undefined });

        expect(screen.queryByText("Test runner")).not.toBeInTheDocument();
    });

    it("shows the test runner row with the current selection for an existing gate", () => {
        renderSelector();

        expect(screen.getByText("Test runner")).toBeVisible();
        const group = within(screen.getByRole("radiogroup", { name: "Test runner" }));
        expect(group.getByRole("radio", { name: /GitHub Actions/i })).toHaveAttribute("aria-checked", "true");
        expect(group.getByRole("radio", { name: /Your own server/i })).toHaveAttribute("aria-checked", "false");
    });

    it("switching to the agent runner calls updateDeployGate and refreshes on success", async () => {
        const onSetupComplete = vi.fn();
        renderSelector({ onSetupComplete });
        const group = within(screen.getByRole("radiogroup", { name: "Test runner" }));

        fireEvent.click(group.getByRole("radio", { name: /Your own server/i }));

        await waitFor(() => expect(api.updateDeployGate).toHaveBeenCalledWith("app-1", "gate-1", { testRunner: "agent" }));
        expect(api.setupSafeDeploy).not.toHaveBeenCalled();
        await waitFor(() => expect(onSetupComplete).toHaveBeenCalled());
    });

    it("switching back to GitHub Actions triggers workflow setup only when not already installed", async () => {
        vi.mocked(api.updateDeployGate).mockResolvedValue({
            gate: { setupStatus: "not_configured" } as never,
        });
        renderSelector({ currentTestRunner: "agent" });
        const group = within(screen.getByRole("radiogroup", { name: "Test runner" }));

        fireEvent.click(group.getByRole("radio", { name: /GitHub Actions/i }));

        await waitFor(() => expect(api.updateDeployGate).toHaveBeenCalledWith("app-1", "gate-1", { testRunner: "github_actions" }));
        await waitFor(() => expect(api.setupSafeDeploy).toHaveBeenCalledWith("app-1", { branch: "main" }));
    });

    it("clicking the already-selected runner is a no-op", () => {
        renderSelector();
        const group = within(screen.getByRole("radiogroup", { name: "Test runner" }));

        fireEvent.click(group.getByRole("radio", { name: /GitHub Actions/i }));

        expect(api.updateDeployGate).not.toHaveBeenCalled();
    });
});
