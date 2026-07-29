import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentSection } from "../EnvironmentSection";
import { MASKED_ENV_VALUE, envRecordToMaskedList } from "../env-helpers";
import type { ComponentProps } from "react";

function renderEnvironment(overrides: Partial<ComponentProps<typeof EnvironmentSection>> = {}) {
    const props: ComponentProps<typeof EnvironmentSection> = {
        appStatus: "running",
        serverId: "srv_test",
        envVars: envRecordToMaskedList({
            API_TOKEN: "super-secret-token",
            PUBLIC_URL: "https://example.com",
        }),
        envVarsChanged: false,
        deleteLocked: false,
        savePending: false,
        saveAndRedeployPending: false,
        deployPending: false,
        onChange: vi.fn(),
        onSave: vi.fn(),
        onSaveAndRedeploy: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<EnvironmentSection {...props} />),
    };
}

describe("EnvironmentSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the env editor and masks secret-like keys", () => {
        renderEnvironment();

        expect(screen.getAllByText("Environment Variables").length).toBeGreaterThan(0);
        expect(screen.getByText(/Frontend frameworks expose only public prefixes/i)).toBeVisible();
        expect(screen.getByDisplayValue("API_TOKEN")).toBeVisible();
        expect(screen.getByDisplayValue(MASKED_ENV_VALUE)).toBeVisible();
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("PUBLIC_URL")).toBeVisible();
        expect(screen.getByDisplayValue("https://example.com")).toBeVisible();
    });

    it("calls the save mutation from the page boundary", () => {
        const onSave = vi.fn();
        renderEnvironment({ envVarsChanged: true, onSave });

        fireEvent.click(screen.getByRole("button", { name: /Save Only/i }));

        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("calls save and redeploy after confirmation when running", () => {
        const onSaveAndRedeploy = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        renderEnvironment({ envVarsChanged: true, onSaveAndRedeploy });

        fireEvent.click(screen.getByRole("button", { name: /Save & Redeploy/i }));

        expect(confirmSpy).toHaveBeenCalledWith("Save environment changes and redeploy this app?");
        expect(onSaveAndRedeploy).toHaveBeenCalledTimes(1);
    });

    it("disables env mutations while deleting", () => {
        renderEnvironment({ deleteLocked: true, envVarsChanged: true });

        expect(screen.getByText("Environment changes are paused while cleanup is pending.")).toBeVisible();
        expect(screen.getByRole("button", { name: /Save Only/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Save & Redeploy/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Add Environment Variable/i })).toBeDisabled();
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
    });
});
