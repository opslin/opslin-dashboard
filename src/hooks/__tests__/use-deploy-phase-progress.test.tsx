/**
 * Unit tests for `useDeployPhaseProgress` and its pure helpers.
 *
 * Validates Requirements 8.1, 8.2, 8.3 — phase_progress events arriving
 * over the WebSocket are accumulated into `PhaseStepStates` matching the
 * design.md mapping table, and VU-specific data fields flow through to
 * `phaseProgressData`.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    mergeVuData,
    reducePhaseStates,
    reduceStepTimestamps,
    useDeployPhaseProgress,
    type StepTimestamps,
} from "../use-deploy-phase-progress";
import type {
    PhaseProgressData,
    PhaseProgressEvent,
    PhaseStepStates,
} from "@/lib/phase-progress-types";

// ---------------------------------------------------------------------------
// MockWebSocket harness — mirrors the pattern in
// `__tests__/use-deployment-live.test.tsx`.
// ---------------------------------------------------------------------------

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((message: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.();
    }
}

function makeEvent(
    step: PhaseProgressEvent["step"],
    overrides: Partial<PhaseProgressEvent> = {}
): PhaseProgressEvent {
    return {
        type: "phase_progress",
        deploymentId: "deploy-1",
        appId: "app-1",
        phase:
            overrides.phase ??
            (step === "vu_running" ||
            step === "vu_complete" ||
            step === "vu_aborted" ||
            step === "health_probing" ||
            step === "health_passed" ||
            step === "report_generated" ||
            step === "route_promoted"
                ? "validation"
                : step === "buildpack_detected" ||
                  step === "image_building" ||
                  step === "image_built" ||
                  step === "ci_gate_passed" ||
                  step === "candidate_started"
                ? "build"
                : "source"),
        step,
        timestamp: overrides.timestamp ?? "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// reducePhaseStates — covers the design.md mapping table.
// ---------------------------------------------------------------------------

describe("reducePhaseStates", () => {
    it("starts every step as undefined (pending) when no events have arrived", () => {
        const initial: PhaseStepStates = {};
        // No events → no entries.
        expect(initial.enqueued).toBeUndefined();
    });

    it("marks `clone_complete` directly as completed", () => {
        const next = reducePhaseStates({}, makeEvent("clone_complete"));
        expect(next.clone_complete).toBe("completed");
    });

    it("marks `image_building` as active and promotes earlier active steps to completed", () => {
        let states: PhaseStepStates = {};
        states = reducePhaseStates(states, makeEvent("enqueued"));
        states = reducePhaseStates(states, makeEvent("agent_assigned"));
        states = reducePhaseStates(states, makeEvent("image_building"));

        expect(states.enqueued).toBe("completed");
        expect(states.agent_assigned).toBe("completed");
        expect(states.image_building).toBe("active");
    });

    it("paints `vu_aborted` as warning even after `vu_running` was active", () => {
        let states: PhaseStepStates = {};
        states = reducePhaseStates(states, makeEvent("vu_running"));
        expect(states.vu_running).toBe("active");

        states = reducePhaseStates(states, makeEvent("vu_aborted"));
        expect(states.vu_aborted).toBe("warning");
        // The warning event is later in the canonical order, so
        // `vu_running` is promoted to completed — the AnimatedBeamPanel
        // already prefers warning over completed at the icon level.
        expect(states.vu_running).toBe("completed");
    });

    it("preserves `warning` once set even when later completion events land", () => {
        let states: PhaseStepStates = {};
        states = reducePhaseStates(states, makeEvent("vu_running"));
        states = reducePhaseStates(states, makeEvent("vu_aborted"));

        // A late `report_generated` arrives after the abort — the warning
        // on `vu_aborted` must not be overwritten.
        states = reducePhaseStates(states, makeEvent("report_generated"));
        expect(states.vu_aborted).toBe("warning");
    });

    it("does not downgrade `completed` back to `active` on duplicate events", () => {
        let states: PhaseStepStates = {};
        states = reducePhaseStates(states, makeEvent("clone_complete"));
        // A late `clone_started` should not flip the icon back to active.
        states = reducePhaseStates(states, makeEvent("clone_started"));
        expect(states.clone_complete).toBe("completed");
    });

    it("ignores unknown step IDs (defensive — future API versions)", () => {
        const before: PhaseStepStates = { enqueued: "active" };
        const after = reducePhaseStates(
            before,
            // Cast via unknown so we can simulate an out-of-spec step.
            makeEvent("some_future_step" as unknown as PhaseProgressEvent["step"])
        );
        expect(after).toEqual(before);
    });
});

// ---------------------------------------------------------------------------
// mergeVuData — verifies the VU-only fields propagate.
// ---------------------------------------------------------------------------

describe("mergeVuData", () => {
    it("returns the current snapshot unchanged when the event has no data", () => {
        const current: PhaseProgressData = { activeVUs: 3 };
        const result = mergeVuData(current, makeEvent("vu_running"));
        expect(result).toBe(current);
    });

    it("ignores data attached to non-validation phases", () => {
        const result = mergeVuData(
            undefined,
            makeEvent("clone_complete", {
                phase: "source",
                data: { activeVUs: 5 } as PhaseProgressData,
            })
        );
        expect(result).toBeUndefined();
    });

    it("merges activeVUs / p95Ms / errorRate from a vu_running event", () => {
        const result = mergeVuData(
            undefined,
            makeEvent("vu_running", {
                data: { activeVUs: 5, p95Ms: 80, errorRate: 0.02 },
            })
        );
        expect(result).toEqual({
            activeVUs: 5,
            p95Ms: 80,
            errorRate: 0.02,
        });
    });

    it("preserves earlier fields when a new event omits them", () => {
        const first = mergeVuData(
            undefined,
            makeEvent("vu_running", {
                data: { activeVUs: 5, p95Ms: 80, errorRate: 0.02 },
            })
        );
        const second = mergeVuData(
            first,
            makeEvent("vu_running", { data: { p95Ms: 120 } })
        );
        expect(second).toEqual({
            activeVUs: 5,
            p95Ms: 120,
            errorRate: 0.02,
        });
    });

    it("captures the abort reason on a vu_aborted event", () => {
        const result = mergeVuData(
            undefined,
            makeEvent("vu_aborted", {
                data: { vuStatus: "aborted", abortReason: "mem_threshold" },
            })
        );
        expect(result).toEqual({
            vuStatus: "aborted",
            abortReason: "mem_threshold",
        });
    });
});

// ---------------------------------------------------------------------------
// reduceStepTimestamps — doc 04 §4 per-step elapsed time needs to know when
// each step's event actually arrived, not just its current visual state.
// ---------------------------------------------------------------------------

describe("reduceStepTimestamps", () => {
    it("records the timestamp of a step's event", () => {
        const next = reduceStepTimestamps(
            {},
            makeEvent("clone_complete", { timestamp: "2026-01-01T00:00:12.000Z" })
        );
        expect(next.clone_complete).toBe("2026-01-01T00:00:12.000Z");
    });

    it("accumulates timestamps for multiple distinct steps", () => {
        let timestamps: StepTimestamps = {};
        timestamps = reduceStepTimestamps(
            timestamps,
            makeEvent("enqueued", { timestamp: "2026-01-01T00:00:00.000Z" })
        );
        timestamps = reduceStepTimestamps(
            timestamps,
            makeEvent("clone_complete", { timestamp: "2026-01-01T00:00:12.000Z" })
        );
        expect(timestamps).toEqual({
            enqueued: "2026-01-01T00:00:00.000Z",
            clone_complete: "2026-01-01T00:00:12.000Z",
        });
    });

    it("overwrites a step's timestamp on a later duplicate event for that same step", () => {
        let timestamps: StepTimestamps = {};
        timestamps = reduceStepTimestamps(
            timestamps,
            makeEvent("vu_running", { timestamp: "2026-01-01T00:00:05.000Z" })
        );
        timestamps = reduceStepTimestamps(
            timestamps,
            makeEvent("vu_running", { timestamp: "2026-01-01T00:00:06.000Z" })
        );
        expect(timestamps.vu_running).toBe("2026-01-01T00:00:06.000Z");
    });

    it("ignores unknown step IDs (defensive — future API versions)", () => {
        const before: StepTimestamps = { enqueued: "2026-01-01T00:00:00.000Z" };
        const after = reduceStepTimestamps(
            before,
            makeEvent("some_future_step" as unknown as PhaseProgressEvent["step"], {
                timestamp: "2026-01-01T00:00:01.000Z",
            })
        );
        expect(after).toEqual(before);
    });
});

// ---------------------------------------------------------------------------
// Hook integration — render a probe component and drive WS frames.
// ---------------------------------------------------------------------------

interface ProbeResult {
    states: PhaseStepStates;
    data: PhaseProgressData | undefined;
    status: string;
    lastEventAt: string | null;
    stepTimestamps: StepTimestamps;
}

function HookProbe({
    deploymentId,
    enabled,
    onState,
}: {
    deploymentId: string | null;
    enabled?: boolean;
    onState: (result: ProbeResult) => void;
}) {
    const result = useDeployPhaseProgress(deploymentId, { enabled });
    onState({
        states: result.phaseStates,
        data: result.phaseProgressData,
        status: result.status,
        lastEventAt: result.lastEventAt,
        stepTimestamps: result.stepTimestamps,
    });
    return (
        <div>
            <span data-testid="status">{result.status}</span>
            <span data-testid="active-vus">
                {result.phaseProgressData?.activeVUs ?? "-"}
            </span>
            <span data-testid="vu-state">
                {result.phaseStates.vu_running ?? "-"}
            </span>
        </div>
    );
}

describe("useDeployPhaseProgress (hook)", () => {
    let latest: ProbeResult = {
        states: {},
        data: undefined,
        status: "idle",
        lastEventAt: null,
        stepTimestamps: {},
    };

    beforeEach(() => {
        vi.stubGlobal("WebSocket", MockWebSocket);
        MockWebSocket.instances = [];
        latest = { states: {}, data: undefined, status: "idle", lastEventAt: null, stepTimestamps: {} };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        MockWebSocket.instances = [];
    });

    it("opens a WebSocket against /deploys/:id/live when given a deploymentId", () => {
        render(
            <HookProbe
                deploymentId="deploy-abc"
                onState={(r) => {
                    latest = r;
                }}
            />
        );

        expect(MockWebSocket.instances).toHaveLength(1);
        expect(MockWebSocket.instances[0].url).toBe(
            "ws://localhost:4000/deploys/deploy-abc/live"
        );
        expect(latest.status).toBe("connecting");
    });

    it("does not open a socket when deploymentId is null", () => {
        render(
            <HookProbe
                deploymentId={null}
                onState={(r) => {
                    latest = r;
                }}
            />
        );

        expect(MockWebSocket.instances).toHaveLength(0);
        expect(latest.status).toBe("idle");
    });

    it("does not open a socket when explicitly disabled", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                enabled={false}
                onState={(r) => {
                    latest = r;
                }}
            />
        );

        expect(MockWebSocket.instances).toHaveLength(0);
        expect(latest.status).toBe("idle");
    });

    it("accumulates phase states from a single phase_progress frame", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        expect(latest.status).toBe("connected");

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(makeEvent("clone_complete")),
            } as MessageEvent);
        });

        expect(latest.states.clone_complete).toBe("completed");
    });

    it("flattens phase_progress_batch envelopes into individual events", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        const batch = {
            type: "phase_progress_batch",
            events: [
                makeEvent("enqueued"),
                makeEvent("agent_assigned"),
                makeEvent("clone_started"),
            ],
        };

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(batch),
            } as MessageEvent);
        });

        expect(latest.states.enqueued).toBe("completed");
        expect(latest.states.agent_assigned).toBe("completed");
        expect(latest.states.clone_started).toBe("active");
    });

    it("surfaces VU-specific data updates from validation events", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("vu_running", {
                        data: {
                            activeVUs: 7,
                            p95Ms: 95,
                            errorRate: 0.013,
                            vuStatus: "running",
                        },
                    })
                ),
            } as MessageEvent);
        });

        expect(latest.data?.activeVUs).toBe(7);
        expect(latest.data?.p95Ms).toBe(95);
        expect(latest.data?.errorRate).toBeCloseTo(0.013);
        expect(latest.states.vu_running).toBe("active");
    });

    it("transitions vu state to warning when a vu_aborted event arrives", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(makeEvent("vu_running")),
            } as MessageEvent);
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("vu_aborted", {
                        data: {
                            vuStatus: "aborted",
                            abortReason: "mem_threshold",
                        },
                    })
                ),
            } as MessageEvent);
        });

        expect(latest.states.vu_aborted).toBe("warning");
        expect(latest.data?.vuStatus).toBe("aborted");
        expect(latest.data?.abortReason).toBe("mem_threshold");
    });

    it("ignores deploy_live_ready handshake frames", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "deploy_live_ready",
                    deploymentId: "deploy-1",
                    appId: "app-1",
                }),
            } as MessageEvent);
        });

        // No phase_progress events were delivered, so state is empty.
        expect(latest.states).toEqual({});
        expect(latest.status).toBe("connected");
    });

    // -----------------------------------------------------------------------
    // phase_progress_snapshot — refresh/reconnect restoration (doc 04 §3).
    // -----------------------------------------------------------------------

    it("folds every event in a phase_progress_snapshot through the same reducer as live events", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "phase_progress_snapshot",
                    deploymentId: "deploy-1",
                    events: [
                        makeEvent("enqueued"),
                        makeEvent("agent_assigned"),
                        makeEvent("clone_complete"),
                    ],
                }),
            } as MessageEvent);
        });

        // Same forward-only promotion as live events: clone_complete is the
        // latest step, so both earlier steps are promoted to completed.
        expect(latest.states.enqueued).toBe("completed");
        expect(latest.states.agent_assigned).toBe("completed");
        expect(latest.states.clone_complete).toBe("completed");
    });

    it("leaves state unchanged on an empty snapshot (deployment predates the feature, or Redis was empty)", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "phase_progress_snapshot",
                    deploymentId: "deploy-1",
                    events: [],
                }),
            } as MessageEvent);
        });

        expect(latest.states).toEqual({});
        expect(latest.status).toBe("connected");
    });

    it("is idempotent when a live event duplicates the tail of the snapshot (handoff overlap)", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "phase_progress_snapshot",
                    deploymentId: "deploy-1",
                    events: [makeEvent("vu_running"), makeEvent("vu_aborted", {
                        data: { vuStatus: "aborted", abortReason: "mem_threshold" },
                    })],
                }),
            } as MessageEvent);
        });
        expect(latest.states.vu_aborted).toBe("warning");

        // The live channel redelivers the same vu_aborted event that was
        // already in the snapshot (a real possibility during the handoff
        // window) — the warning must not be perturbed by the duplicate.
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("vu_aborted", {
                        data: { vuStatus: "aborted", abortReason: "mem_threshold" },
                    })
                ),
            } as MessageEvent);
        });
        expect(latest.states.vu_aborted).toBe("warning");
        expect(latest.data?.abortReason).toBe("mem_threshold");
    });

    it("sets lastEventAt from the snapshot's events, not just live ones", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        expect(latest.lastEventAt).toBeNull();

        act(() => {
            socket.onmessage?.({
                data: JSON.stringify({
                    type: "phase_progress_snapshot",
                    deploymentId: "deploy-1",
                    events: [
                        makeEvent("enqueued", { timestamp: "2026-01-01T00:00:01.000Z" }),
                        makeEvent("clone_complete", { timestamp: "2026-01-01T00:00:05.000Z" }),
                    ],
                }),
            } as MessageEvent);
        });

        expect(latest.lastEventAt).toBe("2026-01-01T00:00:05.000Z");
    });

    it("exposes per-step timestamps for real elapsed-time display (doc 04 §4)", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("clone_started", { timestamp: "2026-01-01T00:00:00.000Z" })
                ),
            } as MessageEvent);
        });
        act(() => {
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("clone_complete", { timestamp: "2026-01-01T00:00:12.000Z" })
                ),
            } as MessageEvent);
        });

        expect(latest.stepTimestamps.clone_started).toBe("2026-01-01T00:00:00.000Z");
        expect(latest.stepTimestamps.clone_complete).toBe("2026-01-01T00:00:12.000Z");
    });

    it("resets accumulated state when the deploymentId changes", () => {
        const { rerender } = render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
            socket.onmessage?.({
                data: JSON.stringify(makeEvent("clone_complete")),
            } as MessageEvent);
        });
        expect(latest.states.clone_complete).toBe("completed");

        rerender(
            <HookProbe
                deploymentId="deploy-2"
                onState={(r) => {
                    latest = r;
                }}
            />
        );

        // After remount with a new id the accumulated state must be empty.
        expect(latest.states.clone_complete).toBeUndefined();
        // A fresh socket instance must be opened against the new deployment.
        const second = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        expect(second.url).toBe("ws://localhost:4000/deploys/deploy-2/live");
    });

    it("renders the latest activeVUs in the probe component DOM", () => {
        render(
            <HookProbe
                deploymentId="deploy-1"
                onState={(r) => {
                    latest = r;
                }}
            />
        );
        const socket = MockWebSocket.instances[0];

        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.();
            socket.onmessage?.({
                data: JSON.stringify(
                    makeEvent("vu_running", { data: { activeVUs: 12 } })
                ),
            } as MessageEvent);
        });

        expect(screen.getByTestId("active-vus")).toHaveTextContent("12");
        expect(screen.getByTestId("vu-state")).toHaveTextContent("active");
    });
});
