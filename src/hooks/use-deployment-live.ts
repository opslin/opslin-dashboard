"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { App, DeployGateSummary, DeploymentCheckReport, DeploymentRecord } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "polling" | "closed";

type DeploymentLiveEvent = {
    type: string;
    appId?: string;
    deploymentId?: string;
    deployments?: DeploymentRecord[];
    latestDeployment?: DeploymentRecord | null;
    deployment?: DeploymentRecord;
    appStatus?: {
        id: string;
        status?: App["status"];
        deployLogs?: string | null;
        deployedAt?: string | null;
        port?: number | null;
        healthStatus?: App["healthStatus"];
    } | null;
    app?: {
        id: string;
        status?: App["status"];
        deployLogs?: string | null;
        deployedAt?: string | null;
        port?: number | null;
        healthStatus?: App["healthStatus"];
    };
    agentStatus?: {
        serverId: string;
        status?: string;
        connected?: boolean;
    } | null;
    ciRun?: DeployGateSummary["lastCiRun"];
    checkReport?: DeploymentCheckReport | null;
    progress?: Record<string, unknown>;
    publishedAt?: string;
};

function sortDeployments(deployments: DeploymentRecord[]) {
    return [...deployments].sort((left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
    );
}

function isTerminalStatus(status: DeploymentRecord["status"] | string | null | undefined) {
    return status === "succeeded" || status === "failed" || status === "aborted" || status === "rolled_back";
}

function mergeDeploymentRecord(
    current: DeploymentRecord | undefined,
    incoming: DeploymentRecord
): DeploymentRecord {
    if (!current) {
        return incoming;
    }

    const currentTerminal = isTerminalStatus(current.status);
    const incomingTerminal = isTerminalStatus(incoming.status);
    const base = currentTerminal && !incomingTerminal ? current : { ...current, ...incoming };

    return {
        ...base,
        status: currentTerminal && !incomingTerminal ? current.status : incoming.status,
        finishedAt: base.finishedAt ?? current.finishedAt ?? incoming.finishedAt,
        healthLog: base.healthLog ?? current.healthLog ?? incoming.healthLog,
        errorClassification: base.errorClassification ?? current.errorClassification ?? incoming.errorClassification,
        checkReport: base.checkReport ?? current.checkReport ?? incoming.checkReport,
        queue: incomingTerminal && !currentTerminal
            ? incoming.queue ?? current.queue
            : currentTerminal && !incomingTerminal
                ? current.queue ?? incoming.queue
                : incoming.queue ?? current.queue,
    };
}

function mergeDeploymentList(current: DeploymentRecord[] | undefined, incoming: DeploymentRecord[]) {
    const merged = new Map<string, DeploymentRecord>();
    for (const deployment of current ?? []) {
        merged.set(deployment.id, deployment);
    }
    for (const deployment of incoming) {
        merged.set(deployment.id, mergeDeploymentRecord(merged.get(deployment.id), deployment));
    }
    return sortDeployments([...merged.values()]);
}

function upsertDeployment(current: DeploymentRecord[] | undefined, deployment: DeploymentRecord) {
    const next = current ? [...current] : [];
    const index = next.findIndex((candidate) => candidate.id === deployment.id);
    if (index >= 0) {
        next[index] = mergeDeploymentRecord(next[index], deployment);
    } else {
        next.unshift(deployment);
    }
    return sortDeployments(next);
}

function patchDeploymentProgress(
    deployment: DeploymentRecord,
    progress: Record<string, unknown>
): DeploymentRecord {
    return {
        ...deployment,
        queue: {
            jobId: deployment.queue?.jobId ?? (typeof progress.jobId === "string" ? progress.jobId : null),
            state: deployment.queue?.state ?? null,
            attemptsMade: deployment.queue?.attemptsMade,
            failedReason: deployment.queue?.failedReason,
            workerPickedAt: deployment.queue?.workerPickedAt,
            lastProgressAt: typeof progress.updatedAt === "string"
                ? progress.updatedAt
                : deployment.queue?.lastProgressAt ?? new Date().toISOString(),
            progress,
        },
    };
}

function ciRunTime(ciRun: DeployGateSummary["lastCiRun"] | undefined | null) {
    const raw = ciRun?.finishedAt || ciRun?.startedAt || ciRun?.createdAt;
    const millis = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(millis) ? millis : 0;
}

function mergeCiRuns(
    current: DeployGateSummary["recentCiRuns"] | undefined,
    incoming: NonNullable<DeployGateSummary["lastCiRun"]>
) {
    const merged = new Map<string, NonNullable<DeployGateSummary["lastCiRun"]>>();
    for (const ciRun of current ?? []) {
        merged.set(ciRun.id, ciRun);
    }
    merged.set(incoming.id, incoming);
    return [...merged.values()]
        .sort((left, right) => ciRunTime(right) - ciRunTime(left))
        .slice(0, 10);
}

export function useDeploymentLive(
    appId: string,
    options: { enabled?: boolean } = {}
) {
    const enabled = options.enabled ?? true;
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<ConnectionStatus>(enabled ? "connecting" : "closed");
    const [lastEventAt, setLastEventAt] = useState<string | null>(null);
    const [staleTick, setStaleTick] = useState(0);
    const lastEventRef = useRef<number>(0);

    useEffect(() => {
        if (!enabled || !appId) {
            setStatus("closed");
            lastEventRef.current = 0;
            return;
        }

        let socket: WebSocket | null = null;
        let reconnectTimer: number | undefined;
        let reconnectAttempt = 0;
        let disposed = false;

        const patchAppCache = (event: DeploymentLiveEvent) => {
            const appPatch = event.app ?? event.appStatus ?? null;
            queryClient.setQueryData(["app", appId], (current: { app?: App; server?: any } | null | undefined) => {
                if (!current?.app && !current?.server) {
                    return current;
                }
                return {
                    ...current,
                    app: current.app
                        ? {
                            ...current.app,
                            ...(appPatch?.status ? { status: appPatch.status } : {}),
                            ...(appPatch?.deployLogs !== undefined ? { deployLogs: appPatch.deployLogs } : {}),
                            ...(appPatch?.port !== undefined ? { port: appPatch.port } : {}),
                            ...(appPatch?.healthStatus ? { healthStatus: appPatch.healthStatus } : {}),
                        }
                        : current.app,
                    server: current.server && event.agentStatus
                        ? {
                            ...current.server,
                            ...(event.agentStatus.status ? { status: event.agentStatus.status.toLowerCase() } : {}),
                            isLiveConnected: event.agentStatus.connected,
                        }
                        : current.server,
                };
            });
        };

        const applyEvent = (event: DeploymentLiveEvent) => {
            if (event.type === "deployment_snapshot") {
                const deployments = event.deployments ?? [];
                queryClient.setQueryData<DeploymentRecord[]>(["appDeployments", appId], (current) =>
                    mergeDeploymentList(current, deployments)
                );
                deployments.forEach((deployment) => {
                    queryClient.setQueryData<DeploymentRecord>(["deploymentDetail", appId, deployment.id], (current) =>
                        mergeDeploymentRecord(current, deployment)
                    );
                });
                patchAppCache(event);
                return;
            }

            if (event.deployment) {
                queryClient.setQueryData<DeploymentRecord[]>(["appDeployments", appId], (current) =>
                    upsertDeployment(current, event.deployment!)
                );
                queryClient.setQueryData<DeploymentRecord>(["deploymentDetail", appId, event.deployment.id], (current) =>
                    mergeDeploymentRecord(current, event.deployment!)
                );
            }

            if (event.type === "job_progress" && event.deploymentId && event.progress) {
                queryClient.setQueryData<DeploymentRecord[]>(["appDeployments", appId], (current) =>
                    (current ?? []).map((deployment) =>
                        deployment.id === event.deploymentId
                            ? patchDeploymentProgress(deployment, event.progress!)
                            : deployment
                    )
                );
                queryClient.setQueryData<DeploymentRecord>(["deploymentDetail", appId, event.deploymentId], (current) =>
                    current ? patchDeploymentProgress(current, event.progress!) : current
                );
            }

            if (event.type === "check_report_updated" && event.deploymentId) {
                queryClient.setQueryData<DeploymentRecord[]>(["appDeployments", appId], (current) =>
                    (current ?? []).map((deployment) =>
                        deployment.id === event.deploymentId
                            ? { ...deployment, checkReport: event.checkReport ?? null }
                            : deployment
                    )
                );
                queryClient.setQueryData<DeploymentRecord & { checkReport?: DeploymentCheckReport | null }>(
                    ["deploymentDetail", appId, event.deploymentId],
                    (current) => current ? { ...current, checkReport: event.checkReport ?? null } : current
                );
                queryClient.setQueryData<DeployGateSummary[]>(["deployGates", appId], (current) =>
                    (current ?? []).map((gate) => ({
                        ...gate,
                        lastDeployment: gate.lastDeployment && gate.lastDeployment.id === event.deploymentId
                            ? { ...gate.lastDeployment, checkReport: event.checkReport ?? null }
                            : gate.lastDeployment,
                    }))
                );
            }

            if (event.type === "ci_run_updated" && event.ciRun) {
                queryClient.setQueryData<DeployGateSummary[]>(["deployGates", appId], (current) =>
                    (current ?? []).map((gate) => {
                        const ciRun = event.ciRun!;
                        const belongsToGate = gate.id === ciRun.deployGateId || gate.lastCiRun?.id === ciRun.id;
                        if (!belongsToGate) {
                            return gate;
                        }

                        const recentCiRuns = mergeCiRuns(gate.recentCiRuns, ciRun);
                        const lastCiRun = !gate.lastCiRun || ciRunTime(ciRun) >= ciRunTime(gate.lastCiRun)
                            ? ciRun
                            : gate.lastCiRun;

                        return {
                            ...gate,
                            lastCiRun,
                            recentCiRuns,
                        };
                    })
                );
            }

            if (event.type === "app_status" || event.type === "agent_status") {
                patchAppCache(event);
            }
        };

        const connect = () => {
            if (disposed) {
                return;
            }
            setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
            socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/apps/${appId}/deployments/live`);

            socket.onopen = () => {
                reconnectAttempt = 0;
                lastEventRef.current = Date.now();
                setLastEventAt(null);
                setStatus("connected");
            };

            socket.onmessage = (message) => {
                try {
                    const event = JSON.parse(message.data) as DeploymentLiveEvent;
                    lastEventRef.current = Date.now();
                    setLastEventAt(new Date().toISOString());
                    applyEvent(event);
                } catch {
                    // Ignore malformed live events; polling fallback remains enabled.
                }
            };

            socket.onerror = () => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.close();
                }
            };

            socket.onclose = () => {
                if (disposed) {
                    return;
                }
                reconnectAttempt += 1;
                setStatus("polling");
                const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
                reconnectTimer = window.setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            disposed = true;
            if (reconnectTimer) {
                window.clearTimeout(reconnectTimer);
            }
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close();
            }
            setStatus("closed");
        };
    }, [appId, enabled, queryClient]);

    useEffect(() => {
        if (status !== "connected") {
            return;
        }
        const timer = window.setInterval(() => setStaleTick(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [status]);

    const isStale = useMemo(() => {
        if (status !== "connected") {
            return true;
        }
        return lastEventRef.current > 0 && Date.now() - lastEventRef.current > 15_000;
    }, [lastEventAt, staleTick, status]);

    return {
        status,
        lastEventAt,
        isStale,
    };
}
