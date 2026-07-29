"use client";

import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { App, DeployGateSummary } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

type SafeDeploySetupWizardProps = {
    idPrefix?: string;
    app: Pick<App, "id" | "gitUrl" | "githubInstallationId" | "branch">;
    gate?: DeployGateSummary | null;
    loading?: boolean;
};

type StepState = "done" | "progress" | "pending" | "failed";

type SetupStep = {
    key: string;
    title: string;
    state: StepState;
    detail: string;
    href?: string | null;
    badge?: string | null;
};

function shortSha(sha?: string | null) {
    return sha ? sha.slice(0, 7) : "unknown";
}

function deploymentLabel(status?: string | null) {
    if (!status) return null;
    return status.replace(/_/g, " ").toUpperCase();
}

function setupFailureDetail(gate?: DeployGateSummary | null) {
    if (gate?.setupMessage) return gate.setupMessage;
    if (gate?.setupStatus === "pr_merged_workflow_missing") {
        return "Workflow file missing on deploy branch. Re-run setup.";
    }
    if (gate?.setupStatus === "pr_closed") {
        return "Setup PR was closed without merge. Re-run setup.";
    }
    if (gate?.setupStatus === "permission_error") {
        return "GitHub permissions need updating for this repository.";
    }
    return "Safe Deploy setup needs attention.";
}

function StepIcon({ state }: { state: StepState }) {
    if (state === "done") {
        return <CheckCircle2 className="h-5 w-5 text-success-text" />;
    }
    if (state === "progress") {
        return <Loader2 className="h-5 w-5 animate-spin text-warning-text" />;
    }
    if (state === "failed") {
        return <XCircle className="h-5 w-5 text-danger-text" />;
    }
    return <Circle className="h-5 w-5 text-muted-foreground/55" />;
}

function statusBadgeClass(value?: string | null) {
    if (!value) return "border-border/80 bg-secondary text-muted-foreground";
    if (["passed", "succeeded", "rolled_back", "merged", "ready"].includes(value)) {
        return "border-success/25 bg-success-muted text-success-text";
    }
    if (["failed", "aborted", "closed", "pr_closed", "pr_merged_workflow_missing", "permission_error"].includes(value)) {
        return "border-danger/25 bg-danger-muted text-danger-text";
    }
    return "border-warning/25 bg-warning-muted text-warning-text";
}

export function SafeDeploySetupWizard({
    idPrefix = "safe-deploy-setup",
    app,
    gate,
    loading,
}: SafeDeploySetupWizardProps) {
    if (loading) {
        return (
            <section id={`${idPrefix}-loading`} className="dashboard-surface p-5">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading Safe Deploy setup status
                </div>
            </section>
        );
    }

    const ciStatus = gate?.lastCiRun?.status ?? null;
    const deployStatus = gate?.lastDeployment?.status ?? gate?.lastDeploymentStatus ?? null;
    const workflowReady = gate?.setupStatus === "ready" || gate?.workflowInstalled === true;
    const workflowProblem = gate?.setupStatus === "pr_merged_workflow_missing" ||
        gate?.setupStatus === "pr_closed" ||
        gate?.setupStatus === "permission_error";
    const prMergedState: StepState = workflowReady
        ? "done"
        : workflowProblem
            ? "failed"
            : gate?.workflowPrState === "merged" && !gate?.setupStatus
                ? "done"
                : gate?.workflowPrUrl
                    ? "progress"
                    : "pending";
    const prMergedDetail = workflowReady
        ? `Workflow installed on ${gate?.workflowInstalledBranch ?? gate?.branch ?? app.branch ?? "deploy branch"}`
        : workflowProblem
            ? setupFailureDetail(gate)
            : gate?.workflowPrState === "merged" && !gate?.setupStatus
                ? "Workflow is available on the deploy branch"
                : "Merge the setup PR to activate CI gating";
    const steps: SetupStep[] = [
        {
            key: "github-app",
            title: "GitHub App Connected",
            state: app.githubInstallationId ? "done" : "pending",
            detail: app.githubInstallationId ? `Connected${gate?.repoFullName ? ` (${gate.repoFullName})` : ""}` : "No GitHub installation linked",
            badge: app.githubInstallationId ? "Connected" : null,
        },
        {
            key: "repository",
            title: "Repository Selected",
            state: app.gitUrl ? "done" : "pending",
            detail: gate?.repoFullName ?? app.gitUrl ?? "Select a GitHub repository",
            badge: app.branch ?? gate?.branch ?? null,
        },
        {
            key: "workflow-pr",
            title: "Workflow PR Created",
            state: gate?.workflowPrUrl || workflowReady ? "done" : gate ? "progress" : "pending",
            detail: gate?.workflowPrUrl
                ? "Workflow pull request is ready for review"
                : workflowReady
                    ? "Workflow is already installed"
                    : "Waiting for Opslin to open the setup PR",
            href: gate?.workflowPrUrl,
            badge: gate?.workflowPrState ?? null,
        },
        {
            key: "pr-merged",
            title: "PR Merged",
            state: prMergedState,
            detail: prMergedDetail,
            badge: gate?.setupStatus ?? gate?.workflowPrState ?? null,
        },
        {
            key: "secrets",
            title: "Secrets Installed",
            state: gate?.secretsInjected ? "done" : gate ? "progress" : "pending",
            detail: gate?.secretsInjected ? "3/3 secrets injected" : "Waiting for repository secret installation",
            badge: gate?.secretsInjected ? "Ready" : null,
        },
        {
            key: "ci-run",
            title: "Last CI Run",
            state: ciStatus === "failed" ? "failed" : ciStatus === "pending" ? "progress" : ciStatus ? "done" : "pending",
            detail: gate?.lastCiRun
                ? `${deploymentLabel(ciStatus)} (${formatRelativeTime(gate.lastCiRun.finishedAt ?? gate.lastCiRun.createdAt)})`
                : "No CI run recorded yet",
            href: gate?.lastCiRun?.runUrl,
            badge: ciStatus,
        },
        {
            key: "last-deploy",
            title: "Last Deploy",
            state: deployStatus === "failed" || deployStatus === "aborted"
                ? "failed"
                : deployStatus === "pending" || deployStatus === "running"
                    ? "progress"
                    : deployStatus
                        ? "done"
                        : "pending",
            detail: gate?.lastDeployment
                ? `${deploymentLabel(deployStatus)} · sha: ${shortSha(gate.lastDeployment.sha)}`
                : "No deployment recorded through this gate",
            badge: deployStatus,
        },
    ];

    return (
        <section id={`${idPrefix}-section`} className="dashboard-surface overflow-hidden">
            <div className="border-b border-border/70 px-5 py-4">
                <p className="dashboard-section-label">Safe Deploy Setup</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">Repository readiness</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Track the GitHub workflow, repository secrets, CI signal, and deployment state for this app.
                </p>
            </div>
            <ol className="divide-y divide-border/70">
                {steps.map((step, index) => (
                    <li
                        id={`${idPrefix}-step-${step.key}`}
                        key={step.key}
                        className="grid gap-4 px-5 py-4 md:grid-cols-[2rem_1fr_auto]"
                    >
                        <div className="relative flex justify-center">
                            <StepIcon state={step.state} />
                            {index < steps.length - 1 ? (
                                <span className="absolute top-7 h-[calc(100%+1rem)] w-px bg-border/80" aria-hidden="true" />
                            ) : null}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{step.detail}</p>
                        </div>
                        <div className="flex items-center gap-2 md:justify-end">
                            {step.badge ? (
                                <Badge variant="outline" className={cn("rounded-md", statusBadgeClass(step.badge))}>
                                    {deploymentLabel(step.badge)}
                                </Badge>
                            ) : null}
                            {step.href ? (
                                <a
                                    id={`${idPrefix}-${step.key}-link`}
                                    href={step.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-2.5 text-xs font-medium text-foreground hover:border-primary/40"
                                >
                                    Open
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}
