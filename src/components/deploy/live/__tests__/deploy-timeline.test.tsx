import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployTimeline } from "../deploy-timeline";
import type { PhaseStepStates } from "@/lib/phase-progress-types";
import type { StepTimestamps } from "@/hooks/use-deploy-phase-progress";

describe("DeployTimeline", () => {
    it("shows a waiting message when no events have arrived yet", () => {
        render(
            <DeployTimeline
                phaseStates={{}}
                stepTimestamps={{}}
                deploymentStartedAt="2026-01-01T00:00:00.000Z"
            />
        );
        expect(screen.getByText(/waiting for the deploy to start/i)).toBeInTheDocument();
    });

    it("only renders steps that have actually arrived — never invents a pending row for a plan-gated step", () => {
        const phaseStates: PhaseStepStates = {
            enqueued: "completed",
            clone_started: "active",
        };
        render(
            <DeployTimeline
                phaseStates={phaseStates}
                stepTimestamps={{ enqueued: "2026-01-01T00:00:00.000Z", clone_started: "2026-01-01T00:00:02.000Z" }}
                deploymentStartedAt="2026-01-01T00:00:00.000Z"
            />
        );
        expect(screen.getByText("Queued")).toBeInTheDocument();
        expect(screen.getByText("Cloning source")).toBeInTheDocument();
        // ci_gate_passed / vu_running / etc. never arrived — must not appear.
        expect(screen.queryByText(/ci gate/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/load test/i)).not.toBeInTheDocument();
    });

    it("groups arrived steps under their real phase headers, in canonical order", () => {
        const phaseStates: PhaseStepStates = {
            enqueued: "completed",
            image_building: "active",
        };
        const stepTimestamps: StepTimestamps = {
            enqueued: "2026-01-01T00:00:00.000Z",
            image_building: "2026-01-01T00:00:20.000Z",
        };
        render(
            <DeployTimeline
                phaseStates={phaseStates}
                stepTimestamps={stepTimestamps}
                deploymentStartedAt="2026-01-01T00:00:00.000Z"
            />
        );
        expect(screen.getByText("Source")).toBeInTheDocument();
        expect(screen.getByText("Build")).toBeInTheDocument();
        // Validate phase has no arrived steps yet, so its header must not render.
        expect(screen.queryByText("Validate")).not.toBeInTheDocument();
    });

    it("shows a real elapsed-since-start label for a completed step", () => {
        const phaseStates: PhaseStepStates = { clone_complete: "completed" };
        const stepTimestamps: StepTimestamps = { clone_complete: "2026-01-01T00:00:12.000Z" };
        render(
            <DeployTimeline
                phaseStates={phaseStates}
                stepTimestamps={stepTimestamps}
                deploymentStartedAt="2026-01-01T00:00:00.000Z"
            />
        );
        expect(screen.getByText("+12s")).toBeInTheDocument();
    });

    it("renders a warning step distinctly from a completed one", () => {
        const phaseStates: PhaseStepStates = { vu_aborted: "warning" };
        const stepTimestamps: StepTimestamps = { vu_aborted: "2026-01-01T00:00:30.000Z" };
        render(
            <DeployTimeline
                phaseStates={phaseStates}
                stepTimestamps={stepTimestamps}
                deploymentStartedAt="2026-01-01T00:00:00.000Z"
            />
        );
        const row = screen.getByText("Load test aborted").closest("li");
        expect(row).toHaveClass("text-warning-text");
    });

    it("does not fabricate an elapsed label when deploymentStartedAt is unavailable", () => {
        const phaseStates: PhaseStepStates = { enqueued: "completed" };
        const stepTimestamps: StepTimestamps = { enqueued: "2026-01-01T00:00:00.000Z" };
        render(
            <DeployTimeline
                phaseStates={phaseStates}
                stepTimestamps={stepTimestamps}
                deploymentStartedAt={null}
            />
        );
        expect(screen.getByText("Queued")).toBeInTheDocument();
        // No +Ns label should render anywhere without a real t0 to diff against.
        expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
    });
});
