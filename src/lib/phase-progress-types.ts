/**
 * Phase progress event types — dashboard-side mirror of the API contract.
 *
 * Mirrors the shape of `phase_progress` events emitted by the API
 * (`opslin-api/src/lib/phase-progress.ts`). Declared locally so the
 * dashboard package does not import from the API package directly, following
 * the same pattern used for `CapacityAdvisory` in `lib/api.ts`.
 *
 * Source of truth: `.kiro/specs/deploy-safety-guard-and-animated-vu-testing/design.md`
 * — "Animation Event Protocol" → "Event Shape: phase_progress" and
 *   "Sub-Step ID Mapping (Frontend)".
 *
 * Requirements traced: 7.1, 7.5, 8.1.
 */

/**
 * Top-level deploy phases. The animated beam UI renders one section per phase
 * (Source → Build → Validation).
 */
export type Phase = "source" | "build" | "validation";

/**
 * Sub-step IDs emitted in `phase_progress` events. Order mirrors the runtime
 * emission sequence documented in design.md.
 */
export type PhaseStep =
    // Source phase
    | "enqueued"
    | "agent_assigned"
    | "clone_started"
    | "clone_complete"
    // Build phase
    | "buildpack_detected"
    | "image_building"
    | "image_built"
    | "ci_gate_passed"
    | "candidate_started"
    // Validation phase
    | "health_probing"
    | "health_passed"
    | "vu_running"
    | "vu_complete"
    | "vu_aborted"
    | "report_generated"
    | "route_promoted";

/**
 * Visual state for an icon in the animated beam panel. Derived from
 * `phaseStates` — see `AnimatedBeamPanel`.
 *
 *   pending   — default, gray; not yet reached.
 *   active    — currently happening; will pulse once Task 13.2 wires animation.
 *   completed — done successfully; rendered green.
 *   warning   — VU aborted or other recoverable error; rendered orange.
 */
export type PhaseStepState = "pending" | "active" | "completed" | "warning";

/**
 * Map keyed by `PhaseStep` carrying the live state for each sub-step.
 *
 * Task 13.4 wires this to `phase_progress` WebSocket events; for now the
 * `AnimatedBeamPanel` accepts an optional `phaseStates` prop and renders all
 * icons as `pending` when undefined.
 */
export type PhaseStepStates = Partial<Record<PhaseStep, PhaseStepState>>;

/**
 * VU run lifecycle status carried in `data.vuStatus` during the validation
 * phase. Mirrors the API publisher.
 */
export type VuStatus = "running" | "complete" | "aborted";

/**
 * Phase-specific data attached to a `phase_progress` event. All fields are
 * optional because each event only populates the keys relevant to its phase
 * and step. Reserved for Task 13.4 wiring.
 */
export interface PhaseProgressData {
    // Source phase
    repoUrl?: string;
    cloneProgress?: number;

    // Build phase
    buildpack?: string;
    buildProgress?: number;
    imageSize?: number;

    // Validation phase
    activeVUs?: number;
    totalVUs?: number;
    p95Ms?: number;
    errorRate?: number;
    elapsedSeconds?: number;
    durationSeconds?: number;
    healthPassed?: boolean;
    vuStatus?: VuStatus;
    abortReason?: string;
}

/**
 * Wire-format `phase_progress` event sent over WebSocket. Reserved for
 * Task 13.4 wiring; defined here so the WS subscriber and the panel agree
 * on a single shape.
 */
export interface PhaseProgressEvent {
    type: "phase_progress";
    deploymentId: string;
    appId: string;
    phase: Phase;
    step: PhaseStep;
    timestamp: string;
    data?: PhaseProgressData;
}
