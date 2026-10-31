/**
 * Which of the four steps is active. Phases come from the server (orchestrator.ts UnitStage and the early phases);
 * a run without a phase falls back to the percent thresholds the page used before.
 */
export function aiStepIndex(phase: string | undefined, percent: number): number {
    switch (phase) {
        case "analyzing":
        case "planning":
        case "queued":
            return 0;
        case "provisioning":
        case "creating_app":
            return 1;
        case "preparing":
        case "rehearsing":
        case "building":
            return 2;
        case "checking":
        case "wiring":
        case "completed":
            return 3;
        default:
            return percent < 15 ? 0 : percent < 45 ? 1 : percent < 85 ? 2 : 3;
    }
}
