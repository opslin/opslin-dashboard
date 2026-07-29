"use client";

/**
 * `useDeployPhaseProgress` — Task 13.4 WebSocket wiring for the
 * AnimatedBeamPanel.
 *
 * Subscribes to `phase_progress` events for a single deployment and
 * exposes the accumulated `PhaseStepStates` plus the latest
 * `PhaseProgressData` so a parent component can feed both into
 * `AnimatedBeamPanel` without re-implementing the reducer at each
 * call-site.
 *
 * Wire format (from `opslin-api/src/lib/phase-progress.ts` and
 * `opslin-api/src/routes/deploy-live.ts`):
 *
 *   - The API publishes per-event `phase_progress` frames, or a coalesced
 *     `phase_progress_batch` envelope `{ events: PhaseProgressEvent[] }`
 *     when multiple events fall inside the 50ms write-coalescing window.
 *   - A `deploy_live_ready` ack is sent on connect; we treat it as a
 *     transport-level connection signal only.
 *
 * Visual-state mapping (`design.md` → "Sub-Step ID Mapping (Frontend)"):
 *
 *   - `vu_aborted` → `warning` (overrides any concurrent `vu_running`)
 *   - Steps that read as the *end* of an action (`clone_complete`,
 *     `image_built`, `ci_gate_passed`, `health_passed`, `vu_complete`,
 *     `route_promoted`) → `completed`.
 *   - Every other step is the *active* phase of an action; it lands in
 *     `active`. When a later step in the canonical order arrives, the
 *     earlier `active` step is promoted to `completed` so the beam panel
 *     visualises a forward-only progression.
 *
 * The reducer never demotes a `warning` back to `completed` — once the
 * VU run reports an abort it stays orange for the rest of the deploy
 * even if a downstream `route_promoted` arrives.
 *
 * Validates Requirements 8.1, 8.2, 8.3.
 */

import { useEffect, useRef, useState } from "react";

import type {
    PhaseProgressData,
    PhaseProgressEvent,
    PhaseStep,
    PhaseStepState,
    PhaseStepStates,
} from "@/lib/phase-progress-types";

// ---------------------------------------------------------------------------
// Step ordering + completion mapping (mirrors design.md)
// ---------------------------------------------------------------------------

/**
 * Canonical emission order of sub-steps in a deploy. Used to mark earlier
 * `active` steps as `completed` when a later step lands.
 *
 * Mirrors the `PHASE_STEPS` declaration order in
 * `opslin-api/src/lib/phase-progress.ts`.
 */
const STEP_ORDER: readonly PhaseStep[] = [
    "enqueued",
    "agent_assigned",
    "clone_started",
    "clone_complete",
    "buildpack_detected",
    "image_building",
    "image_built",
    "ci_gate_passed",
    "candidate_started",
    "health_probing",
    "health_passed",
    "vu_running",
    "vu_complete",
    "vu_aborted",
    "report_generated",
    "route_promoted",
];

const STEP_INDEX: Readonly<Record<PhaseStep, number>> = STEP_ORDER.reduce(
    (acc, step, index) => {
        acc[step] = index;
        return acc;
    },
    {} as Record<PhaseStep, number>
);

/**
 * Sub-steps whose arrival means "the action is finished" — they paint
 * their corresponding icon green directly. Every other sub-step paints
 * the icon as `active` and gets promoted to `completed` only when a
 * later step lands.
 *
 * Sourced from design.md "Sub-Step ID Mapping (Frontend)" — entries
 * marked "solid green" in the Icon Highlight column.
 */
const COMPLETION_STEPS: ReadonlySet<PhaseStep> = new Set<PhaseStep>([
    "clone_complete",
    "image_built",
    "ci_gate_passed",
    "health_passed",
    "vu_complete",
    "route_promoted",
]);

/**
 * Reduce a phase-progress event into the next `PhaseStepStates` map.
 *
 * Pure, exported for direct unit testing without the WS plumbing.
 */
export function reducePhaseStates(
    current: PhaseStepStates,
    event: PhaseProgressEvent
): PhaseStepStates {
    const step = event.step;
    if (typeof STEP_INDEX[step] !== "number") {
        // Unknown sub-step ID — keep state untouched. Defensive: the wire
        // type is `PhaseStep`, but a future API version could emit a new
        // step that this dashboard doesn't yet know about.
        return current;
    }

    const next: PhaseStepStates = { ...current };

    // 1. Promote earlier in-flight steps to `completed`. Skip steps that
    // already carry a `warning` so a VU abort isn't masked by a later
    // event (Requirement 8.6).
    const incomingIndex = STEP_INDEX[step];
    for (const earlierStep of STEP_ORDER) {
        if (STEP_INDEX[earlierStep] >= incomingIndex) {
            break;
        }
        const prior = next[earlierStep];
        if (prior === "warning") {
            continue;
        }
        if (prior === "active") {
            next[earlierStep] = "completed";
        }
    }

    // 2. Apply the incoming step's visual state.
    let incomingState: PhaseStepState;
    if (step === "vu_aborted") {
        incomingState = "warning";
    } else if (COMPLETION_STEPS.has(step)) {
        incomingState = "completed";
    } else {
        incomingState = "active";
    }

    // Don't downgrade a step that is already in a stronger state — e.g.
    // a duplicate `vu_running` arriving after a `vu_aborted` mustn't
    // flip the icon back to active.
    const previousState = next[step];
    if (previousState === "warning" && incomingState !== "warning") {
        return next;
    }
    if (previousState === "completed" && incomingState === "active") {
        return next;
    }
    next[step] = incomingState;

    return next;
}

// ---------------------------------------------------------------------------
// Per-step timestamps — doc 04 §4 "per-step elapsed = diff of real event
// timestamps" needs to know *when* each step's event arrived, not just its
// current visual state. Pure and order-tolerant like the reducer above: a
// duplicate or out-of-order event for a step just overwrites with its own
// (real) timestamp, which is fine since every event for a given step carries
// that step's own arrival time regardless of delivery order.
// ---------------------------------------------------------------------------

export type StepTimestamps = Partial<Record<PhaseStep, string>>;

export function reduceStepTimestamps(
    current: StepTimestamps,
    event: PhaseProgressEvent
): StepTimestamps {
    if (typeof STEP_INDEX[event.step] !== "number") {
        return current;
    }
    return { ...current, [event.step]: event.timestamp };
}

// ---------------------------------------------------------------------------
// VU data merge — we keep the latest non-undefined value for each field.
// ---------------------------------------------------------------------------

/**
 * Merge phase-progress `data` into the running `PhaseProgressData`
 * snapshot. Only validation-phase keys are tracked because that's what
 * `AnimatedBeamPanel` consumes in `phaseProgressData` (the VU node).
 *
 * Returns `current` unchanged when the event carries no relevant data —
 * the caller can detect "no change" via reference equality and skip a
 * `setState` call.
 */
export function mergeVuData(
    current: PhaseProgressData | undefined,
    event: PhaseProgressEvent
): PhaseProgressData | undefined {
    const data = event.data;
    if (!data) {
        return current;
    }

    // Only the validation phase carries VU-specific fields the beam
    // panel renders. Source / build phases get short-circuited to keep
    // the snapshot small and the comparison cheap.
    if (event.phase !== "validation") {
        return current;
    }

    const merged: PhaseProgressData = { ...(current ?? {}) };
    let mutated = false;

    if (typeof data.activeVUs === "number") {
        merged.activeVUs = data.activeVUs;
        mutated = true;
    }
    if (typeof data.totalVUs === "number") {
        merged.totalVUs = data.totalVUs;
        mutated = true;
    }
    if (typeof data.p95Ms === "number") {
        merged.p95Ms = data.p95Ms;
        mutated = true;
    }
    if (typeof data.errorRate === "number") {
        merged.errorRate = data.errorRate;
        mutated = true;
    }
    if (typeof data.elapsedSeconds === "number") {
        merged.elapsedSeconds = data.elapsedSeconds;
        mutated = true;
    }
    if (typeof data.durationSeconds === "number") {
        merged.durationSeconds = data.durationSeconds;
        mutated = true;
    }
    if (typeof data.healthPassed === "boolean") {
        merged.healthPassed = data.healthPassed;
        mutated = true;
    }
    if (typeof data.vuStatus === "string") {
        merged.vuStatus = data.vuStatus;
        mutated = true;
    }
    if (typeof data.abortReason === "string") {
        merged.abortReason = data.abortReason;
        mutated = true;
    }

    return mutated ? merged : current;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ConnectionStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "closed";

/**
 * Top-level frame we accept on the deploy-live socket. Either a single
 * `phase_progress` event, the `phase_progress_batch` envelope from the
 * API's 50ms coalescer, the `phase_progress_snapshot` replay sent once per
 * connection before the `deploy_live_ready` ack (doc 04 §3 — refresh/
 * reconnect restoration), or the ack itself.
 */
type DeployLiveFrame =
    | PhaseProgressEvent
    | { type: "phase_progress_batch"; events: PhaseProgressEvent[] }
    | { type: "phase_progress_snapshot"; deploymentId: string; events: PhaseProgressEvent[] }
    | { type: "deploy_live_ready"; deploymentId: string; appId: string }
    | { type: string };

export interface UseDeployPhaseProgressOptions {
    /** Disable the subscription. Defaults to `true` (enabled). */
    enabled?: boolean;
}

export interface UseDeployPhaseProgressResult {
    phaseStates: PhaseStepStates;
    phaseProgressData: PhaseProgressData | undefined;
    status: ConnectionStatus;
    /** ISO timestamp of the most recent phase_progress event, or null. */
    lastEventAt: string | null;
    /** ISO timestamp each step's (latest) event arrived — doc 04 §4 per-step elapsed. */
    stepTimestamps: StepTimestamps;
}

/**
 * Subscribe to `phase_progress` events for a deployment and expose the
 * derived state for the AnimatedBeamPanel.
 */
export function useDeployPhaseProgress(
    deploymentId: string | null | undefined,
    options: UseDeployPhaseProgressOptions = {}
): UseDeployPhaseProgressResult {
    const enabled = options.enabled ?? true;

    const [phaseStates, setPhaseStates] = useState<PhaseStepStates>({});
    const [phaseProgressData, setPhaseProgressData] =
        useState<PhaseProgressData | undefined>(undefined);
    const [status, setStatus] = useState<ConnectionStatus>(
        enabled && deploymentId ? "connecting" : "idle"
    );
    const [lastEventAt, setLastEventAt] = useState<string | null>(null);
    const [stepTimestamps, setStepTimestamps] = useState<StepTimestamps>({});

    // The socket-handle ref is used to bail out of late callbacks when
    // the effect has torn down (`disposed = true`).
    const disposedRef = useRef(false);

    useEffect(() => {
        // Reset accumulated state whenever the deploymentId changes — the
        // beam panel for deployment B must not inherit deployment A's
        // icon states.
        setPhaseStates({});
        setPhaseProgressData(undefined);
        setLastEventAt(null);
        setStepTimestamps({});

        if (!enabled || !deploymentId) {
            setStatus("idle");
            return;
        }

        if (typeof WebSocket === "undefined") {
            // SSR / non-browser environments: stay idle. The component
            // tree will hydrate on the client and re-run this effect.
            setStatus("idle");
            return;
        }

        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let reconnectAttempt = 0;
        disposedRef.current = false;

        const handleEvent = (event: PhaseProgressEvent) => {
            setLastEventAt(event.timestamp || new Date().toISOString());
            setPhaseStates((current) => reducePhaseStates(current, event));
            setPhaseProgressData((current) => mergeVuData(current, event));
            setStepTimestamps((current) => reduceStepTimestamps(current, event));
        };

        const handleFrame = (frame: DeployLiveFrame) => {
            if (frame.type === "phase_progress") {
                handleEvent(frame as PhaseProgressEvent);
                return;
            }
            if (frame.type === "phase_progress_batch") {
                const batch = frame as {
                    type: "phase_progress_batch";
                    events: PhaseProgressEvent[];
                };
                for (const event of batch.events ?? []) {
                    handleEvent(event);
                }
                return;
            }
            if (frame.type === "phase_progress_snapshot") {
                // Refresh/reconnect restoration (doc 04 §3) — sent once per
                // connection, before deploy_live_ready. Folding through the
                // same handleEvent path (same reducers) means a replayed
                // event and a live duplicate of it are handled identically —
                // the reducers are idempotent per step-state, so replaying
                // an already-applied step is a harmless no-op. An empty
                // `events` array (deployment predates this feature, or Redis
                // was unavailable) leaves state exactly as it already was —
                // the pre-existing behavior doc 04 §3.4 requires.
                const snapshot = frame as {
                    type: "phase_progress_snapshot";
                    deploymentId: string;
                    events: PhaseProgressEvent[];
                };
                for (const event of snapshot.events ?? []) {
                    handleEvent(event);
                }
                return;
            }
            // `deploy_live_ready` and any other transport-level frames
            // are ignored — they don't carry beam state.
        };

        const connect = () => {
            if (disposedRef.current) {
                return;
            }
            setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
            const wsUrl = `${API_URL.replace(/^http/, "ws")}/deploys/${deploymentId}/live`;
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                if (disposedRef.current) {
                    return;
                }
                reconnectAttempt = 0;
                setStatus("connected");
            };

            socket.onmessage = (message) => {
                if (disposedRef.current) {
                    return;
                }
                let parsed: DeployLiveFrame;
                try {
                    parsed = JSON.parse(message.data) as DeployLiveFrame;
                } catch {
                    // Malformed frame — best-effort UX channel, drop it.
                    return;
                }
                handleFrame(parsed);
            };

            socket.onerror = () => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.close();
                }
            };

            socket.onclose = () => {
                if (disposedRef.current) {
                    return;
                }
                reconnectAttempt += 1;
                setStatus("reconnecting");
                const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
                reconnectTimer = setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            disposedRef.current = true;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (
                socket &&
                (socket.readyState === WebSocket.OPEN ||
                    socket.readyState === WebSocket.CONNECTING)
            ) {
                socket.close();
            }
            setStatus("closed");
        };
    }, [deploymentId, enabled]);

    return {
        phaseStates,
        phaseProgressData,
        status,
        lastEventAt,
        stepTimestamps,
    };
}
