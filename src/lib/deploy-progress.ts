export type DeployStage =
    | "cloning"
    | "detecting"
    | "building"
    | "deploying"
    | "ssl"
    | "health"
    | "completed";

export type DeployStageStatus = "pending" | "running" | "completed" | "error";

export type DeployStageState = {
    key: DeployStage;
    label: string;
    status: DeployStageStatus;
    description?: string;
    elapsedMs?: number;
};

export type DeployProgressEvent = {
    stage: DeployStage;
    percentage: number;
    description: string;
    status: "running" | "completed" | "failed";
    elapsedMs: number;
};

export type DeployOperationType = "deploy" | "rollback" | "stop" | "delete";

export const DEPLOY_STAGES: Array<{ key: DeployStage; label: string }> = [
    { key: "cloning", label: "Clone repository" },
    { key: "detecting", label: "Detect runtime" },
    { key: "building", label: "Build image" },
    { key: "deploying", label: "Start container" },
    { key: "ssl", label: "Configure SSL" },
    { key: "health", label: "Health check" },
    { key: "completed", label: "Complete" },
];

const stageAliases: Record<string, DeployStage> = {
    clone: "cloning",
    cloning: "cloning",
    detect: "detecting",
    detecting: "detecting",
    build: "building",
    building: "building",
    deploy: "deploying",
    deploying: "deploying",
    ssl: "ssl",
    healthcheck: "health",
    health: "health",
    completed: "completed",
    complete: "completed",
};

export function createInitialDeployStages(): DeployStageState[] {
    return DEPLOY_STAGES.map((stage) => ({
        ...stage,
        status: "pending",
    }));
}

export function clampProgress(value: unknown) {
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function isRecoverableDeployWarningLine(line: string) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) {
        return false;
    }

    return /failed to configure registry cache importer/.test(normalized) ||
        /healthcheck\s+attempt\s+\d+\s+failed/.test(normalized) ||
        /health\s*check\s+attempt\s+\d+\s+failed/.test(normalized);
}

export function collectRecoverableDeployWarnings(logs: string) {
    return logs
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => isRecoverableDeployWarningLine(line));
}

export function isTerminalDeploymentStatus(status?: string | null) {
    const normalized = status?.toLowerCase();
    return normalized === "failed" ||
        normalized === "aborted" ||
        normalized === "error" ||
        normalized === "delete_failed";
}

export function isSuccessfulOperationStatus(
    operationType: DeployOperationType,
    status?: string | null
) {
    const normalized = status?.toLowerCase();
    if (operationType === "stop") {
        return normalized === "stopped";
    }
    if (operationType === "delete") {
        return false;
    }
    return normalized === "running" ||
        normalized === "succeeded" ||
        normalized === "completed" ||
        normalized === "rolled_back";
}

export function normalizeDeployProgressEvent(raw: unknown): DeployProgressEvent | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const record = raw as Record<string, unknown>;
    const rawStage = String(record.stage ?? record.phase ?? "").toLowerCase();
    const stage = stageAliases[rawStage];
    if (!stage) {
        return null;
    }

    let rawStatus: DeployProgressEvent["status"] = record.status === "completed" || record.status === "failed"
        ? record.status
        : "running";
    const rawDescription = record.description ?? record.line ?? "";
    const description = typeof rawDescription === "string" ? rawDescription : "";
    if (rawStatus === "failed" && isRecoverableDeployWarningLine(description)) {
        rawStatus = "running";
    }

    return {
        stage,
        percentage: clampProgress(record.percentage ?? record.percent),
        description,
        status: rawStatus,
        elapsedMs: typeof record.elapsedMs === "number" && Number.isFinite(record.elapsedMs)
            ? Math.max(0, record.elapsedMs)
            : 0,
    };
}

export function applyDeployProgress(
    stages: DeployStageState[],
    event: DeployProgressEvent
): DeployStageState[] {
    const currentIndex = DEPLOY_STAGES.findIndex((stage) => stage.key === event.stage);
    if (currentIndex < 0) {
        return stages;
    }

    return DEPLOY_STAGES.map((stage, index) => {
        const existing = stages.find((candidate) => candidate.key === stage.key);
        const next: DeployStageState = {
            key: stage.key,
            label: stage.label,
            status: existing?.status ?? "pending",
            description: existing?.description,
            elapsedMs: existing?.elapsedMs,
        };

        if (event.status === "failed" && index === currentIndex) {
            return {
                ...next,
                status: "error",
                description: event.description,
                elapsedMs: event.elapsedMs,
            };
        }

        if (index < currentIndex || event.stage === "completed") {
            return { ...next, status: "completed" };
        }

        if (index === currentIndex) {
            return {
                ...next,
                status: event.status === "completed" ? "completed" : "running",
                description: event.description,
                elapsedMs: event.elapsedMs,
            };
        }

        return next;
    });
}

export function appendBuildLogLines(existing: string[], next: string | string[], maxLines = 5000) {
    const incoming = Array.isArray(next)
        ? next
        : next.split("\n");
    const filtered = incoming.filter((line) => line.trim().length > 0);
    return [...existing, ...filtered].slice(-maxLines);
}

export function formatElapsed(ms: number | undefined) {
    if (!ms || ms < 1000) {
        return "<1s";
    }
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}
