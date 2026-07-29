import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDeployAnnouncement } from "../use-deploy-announcer";
import type { PhaseStepStates } from "@/lib/phase-progress-types";

describe("useDeployAnnouncement", () => {
    it("announces a step starting", () => {
        const { result, rerender } = renderHook(
            ({ states }: { states: PhaseStepStates }) => useDeployAnnouncement(states, "running", null),
            { initialProps: { states: {} as PhaseStepStates } }
        );
        expect(result.current).toBe("");

        rerender({ states: { clone_started: "active" } });
        expect(result.current).toBe("Cloning source starting.");
    });

    it("announces a step completing", () => {
        const { result, rerender } = renderHook(
            ({ states }: { states: PhaseStepStates }) => useDeployAnnouncement(states, "running", null),
            { initialProps: { states: { clone_started: "active" } as PhaseStepStates } }
        );

        rerender({ states: { clone_started: "completed", clone_complete: "completed" } });
        expect(result.current).toContain("complete.");
    });

    it("announces a warning distinctly", () => {
        const { result, rerender } = renderHook(
            ({ states }: { states: PhaseStepStates }) => useDeployAnnouncement(states, "running", null),
            { initialProps: { states: { vu_running: "active" } as PhaseStepStates } }
        );

        rerender({ states: { vu_running: "completed", vu_aborted: "warning" } });
        expect(result.current).toContain("warning.");
    });

    it("announces success with the real app domain", () => {
        // A stable phaseStates reference across rerenders, matching how the
        // real caller (useDeployPhaseProgress) behaves — the hook is
        // documented to require this, so the test must honor it too.
        const stableStates: PhaseStepStates = {};
        const { result, rerender } = renderHook<string, { status: "running" | "succeeded" }>(
            ({ status }) => useDeployAnnouncement(stableStates, status, "my-app.opslin.app"),
            { initialProps: { status: "running" } }
        );

        rerender({ status: "succeeded" });
        expect(result.current).toBe("Deployment complete. Your app is live at my-app.opslin.app.");
    });

    it("announces failure without any fabricated success language", () => {
        const stableStates: PhaseStepStates = {};
        const { result, rerender } = renderHook<string, { status: "running" | "failed" }>(
            ({ status }) => useDeployAnnouncement(stableStates, status, null),
            { initialProps: { status: "running" } }
        );

        rerender({ status: "failed" });
        expect(result.current).toBe("Deployment failed.");
    });

    it("does not re-announce the same terminal status twice", () => {
        const stableStates: PhaseStepStates = {};
        const { result, rerender } = renderHook<string, { status: "running" | "succeeded" }>(
            ({ status }) => useDeployAnnouncement(stableStates, status, null),
            { initialProps: { status: "running" } }
        );
        rerender({ status: "succeeded" });
        const first = result.current;
        rerender({ status: "succeeded" });
        expect(result.current).toBe(first);
    });
});
