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

    const isRealAttempt = (deployment: DeploymentRecord) => !isLockBusyDeployment(deployment);
    const running = deployments.find((deployment) => deployment.status === "running" && isRealAttempt(deployment));
    if (running) {
        return running;
    }

    const pending = deployments.find((deployment) => deployment.status === "pending" && isRealAttempt(deployment));
    if (pending) {
        return pending;
    }

    const liveDeployment = deployments.find((deployment) =>
        (deployment.status === "succeeded" || deployment.status === "rolled_back") && isRealAttempt(deployment)
    );
    if (liveDeployment) {
        return liveDeployment;
    }

    const newestRealAttempt = deployments.find(isRealAttempt);
    if (newestRealAttempt) {
        return newestRealAttempt;
    }

    return deployments[0];
}
