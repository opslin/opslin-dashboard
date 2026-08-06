import type { DeployGateSummary, DeploymentRecord } from "@/lib/api";

const LOCK_BUSY_PATTERNS = [
    /another\s+deployment\s+(?:is|was)\s+already\s+running/i,
    /deployment\s+lock\s+busy/i,
    /lock:app:.*already\s+held/i,
];

export function isLockBusyDeployment(deployment: DeploymentRecord) {
    const classification = deployment.errorClassification as ({
        category?: string;
        code?: string;
        currentImpact?: string;
    } | null | undefined);
    if (deployment.errorClassification?.category === "DEPLOYMENT_LOCK_BUSY") {
        return true;
    }
    if (
        classification?.code === "deployment_lock_busy" ||
        classification?.currentImpact === "blocked_duplicate_not_release_failure"
    ) {
        return true;
    }
    const text = deployment.healthLog || deployment.queue?.failedReason || "";
    return LOCK_BUSY_PATTERNS.some((pattern) => pattern.test(text));
}

export function selectCurrentDeploymentTruth(
    deployments: DeploymentRecord[],
    _ciRun?: DeployGateSummary["lastCiRun"] | null
) {
    if (deployments.length === 0) {
        return null;
    }

    // `deployments` is fetched newest-first (apps-service.ts, orderBy startedAt desc) — that
    // ordering is the invariant this whole function relies on.
    const isRealAttempt = (deployment: DeploymentRecord) => !isLockBusyDeployment(deployment);
    const realAttempts = deployments.filter(isRealAttempt);
    if (realAttempts.length === 0) {
        return deployments[0];
    }

    const running = realAttempts.find((deployment) => deployment.status === "running");
    if (running) {
        return running;
    }

    const pending = realAttempts.find((deployment) => deployment.status === "pending");
    if (pending) {
        return pending;
    }

    // The newest real attempt is the current truth once it has reached ANY terminal state —
    // succeeded, failed, aborted, or rolled_back. A previous version of this function instead
    // searched all of history for the nearest succeeded/rolled_back row before ever checking
    // whether the newest attempt itself was terminal, which meant a deploy that had just
    // failed (e.g. against a disconnected server) got silently swapped for an older
    // successful deployment — driving a "Your app is LIVE!" celebration and a green
    // "Succeeded" badge for a deploy that had, in reality, just failed. Reporting a failure as
    // a failure is the whole point of this selector; only fall back to scanning history if the
    // newest real attempt is somehow still non-terminal (shouldn't normally happen once
    // running/pending are ruled out above).
    return realAttempts[0];
}
