import type { AppWithServer, DeploymentRecord } from "@/lib/api";
import { deployActor, deployTitle } from "@/components/apps/deploy-ui";

export type DeploymentItem = {
    deployment: DeploymentRecord;
    app: AppWithServer;
    /** The version that is serving traffic for this app right now. */
    live: boolean;
    /** The version before this app's live one that a roll back would go to. */
    rollbackTo: DeploymentRecord | null;
};

export type StatusFilter = "all" | "running" | "failed" | "succeeded";

const DAY = 86_400_000;

export const isRunning = (d: DeploymentRecord) => d.status === "running" || d.status === "pending";
export const isFailed = (d: DeploymentRecord) => d.status === "failed" || d.status === "aborted";
export const isGood = (d: DeploymentRecord) => d.status === "succeeded" || d.status === "rolled_back";

/** Merge deployments of every app into one newest-first list and mark which one is live. */
export function buildItems(perApp: Array<{ app: AppWithServer; deployments: DeploymentRecord[] }>, perAppLimit = 10): DeploymentItem[] {
    const items: DeploymentItem[] = [];
    for (const { app, deployments } of perApp) {
        const sorted = [...deployments].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        const succeeded = sorted.filter((d) => d.status === "succeeded");
        const liveId = app.status === "running" || app.status === "deploying" ? succeeded[0]?.id : undefined;
        for (const deployment of sorted.slice(0, perAppLimit)) {
            const live = deployment.id === liveId;
            const rollbackTo = live ? (succeeded[1] ?? null) : null;
            items.push({ deployment, app, live, rollbackTo });
        }
    }
    return items.sort((a, b) => new Date(b.deployment.startedAt).getTime() - new Date(a.deployment.startedAt).getTime());
}

export type DeploymentStats = {
    running: DeploymentItem | null;
    runningCount: number;
    failedThisWeek: number;
    lastFailedAt: string | null;
    successRate: number | null;
    finishedThisWeek: number;
};

export function computeStats(items: DeploymentItem[], now = Date.now()): DeploymentStats {
    const running = items.filter((item) => isRunning(item.deployment));
    const week = items.filter((item) => now - new Date(item.deployment.startedAt).getTime() <= 7 * DAY);
    const failed = week.filter((item) => isFailed(item.deployment));
    const succeeded = week.filter((item) => item.deployment.status === "succeeded");
    const finished = failed.length + succeeded.length;
    return {
        running: running[0] ?? null,
        runningCount: running.length,
        failedThisWeek: failed.length,
        lastFailedAt: failed[0] ? (failed[0].deployment.finishedAt ?? failed[0].deployment.startedAt) : null,
        successRate: finished > 0 ? Math.round((succeeded.length / finished) * 100) : null,
        finishedThisWeek: finished,
    };
}

export function filterItems(items: DeploymentItem[], filters: { query: string; status: StatusFilter; appId: string }): DeploymentItem[] {
    const q = filters.query.trim().toLowerCase();
    return items.filter(({ deployment, app }) => {
        if (filters.appId !== "all" && app.id !== filters.appId) return false;
        if (filters.status === "running" && !isRunning(deployment)) return false;
        if (filters.status === "failed" && !isFailed(deployment)) return false;
        if (filters.status === "succeeded" && !isGood(deployment)) return false;
        if (!q) return true;
        return `${app.name} ${deployment.sha} ${deployTitle(deployment)}`.toLowerCase().includes(q);
    });
}

/** The newest deployment of an app failed and nothing newer succeeded. */
export function latestFailure(items: DeploymentItem[], now = Date.now()): DeploymentItem | null {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.app.id)) continue;
        seen.add(item.app.id);
        if (isFailed(item.deployment) && now - new Date(item.deployment.startedAt).getTime() <= 7 * DAY) return item;
    }
    return null;
}

export function statusLabel(item: DeploymentItem): { label: string; tone: "success" | "danger" | "info" | "neutral" | "live" } {
    const { deployment } = item;
    if (isRunning(deployment)) return { label: "Deploying", tone: "info" };
    if (deployment.status === "failed") return { label: "Failed", tone: "danger" };
    if (deployment.status === "aborted") return { label: "Cancelled", tone: "neutral" };
    if (deployment.status === "rolled_back") return { label: "Rolled back", tone: "neutral" };
    return item.live ? { label: "Live", tone: "live" } : { label: "Succeeded", tone: "success" };
}

export { deployActor, deployTitle };
