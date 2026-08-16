"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, StopCircle, RotateCcw, Trash2 } from "lucide-react";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressModal, parseError } from "@/components/ui/progress-modal";
import type { EnvVar } from "@/components/ui/env-vars-editor";
import { DeployLiveView } from "@/components/deploy/live/deploy-live-view";
import {
    DeployProgressIndicator,
    PreviousVersionRunningNotice,
    type DeployProgressProps,
} from "@/components/deployment/deploy-progress-indicator";
import { RollbackConfirmDialog } from "@/components/apps/RollbackConfirmDialog";
import { AppHeader } from "@/components/apps/AppHeader";
import { AppSectionNav, normalizeAppSection, type AppSectionId } from "@/components/apps/AppSectionNav";
import type { DeployMode } from "@/components/DeployModeSelector";
import { OverviewSection } from "@/components/apps/sections/OverviewSection";
import { DeploymentsSection } from "@/components/apps/sections/DeploymentsSection";
import { DomainsSection } from "@/components/apps/sections/DomainsSection";
import { EnvironmentSection } from "@/components/apps/sections/EnvironmentSection";
import { LogsSection } from "@/components/apps/sections/LogsSection";
import { MetricsSection } from "@/components/apps/sections/MetricsSection";
import { SettingsSection } from "@/components/apps/sections/SettingsSection";
import { AppSecurityPage } from "@/components/apps/security/AppSecurityPage";
import { envRecordToMaskedList, maskEnvVarList, serializeEnvVarsForSave } from "@/components/apps/sections/env-helpers";
import { api, ApiRequestError, type App, type AppBuildpackName, type BuildpackName, type DeploymentRecord, type DomainCheckResult, type HealthCheckMode, type PreflightCheck, type RiskScoreResult } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { PreflightChecksPanel } from "@/components/apps/preflight-checks-panel";
import { useDeploymentLive } from "@/hooks/use-deployment-live";
import {
    appAccessUrl,
    repoFullNameFromGitUrl,
} from "@/components/apps/app-helpers";
import { selectCurrentDeploymentTruth } from "@/lib/deployment-selectors";
import {
    appendBuildLogLines,
    applyDeployProgress,
    clampProgress,
    collectRecoverableDeployWarnings,
    createInitialDeployStages,
    isRecoverableDeployWarningLine,
    isSuccessfulOperationStatus,
    isTerminalDeploymentStatus,
    normalizeDeployProgressEvent,
    type DeployStageState,
} from "@/lib/deploy-progress";

type OperationType = "deploy" | "rollback" | "stop" | "delete";
type ProgressStepState = { label: string; status: "pending" | "running" | "completed" | "error" };

function normalizeBuildpackForForm(value?: AppBuildpackName | null): BuildpackName | "" {
    if (!value) {
        return "";
    }

    const normalized = value.toLowerCase();
    if (["node", "react", "vite", "cra", "create-react-app", "next", "nextjs", "next.js", "next_static", "angular", "vue", "nuxt", "svelte", "sveltekit"].includes(normalized)) {
        return "node";
    }
    if (["python", "django", "flask", "fastapi"].includes(normalized)) {
        return "python";
    }
    if (normalized === "go" || normalized === "golang") {
        return "go";
    }
    if (normalized === "php" || normalized === "laravel") {
        return "php";
    }
    if (normalized === "ruby" || normalized === "rails") {
        return "ruby";
    }
    if (["java", "spring", "springboot"].includes(normalized)) {
        return "java";
    }
    if (normalized === "rust") {
        return "rust";
    }
    if (normalized === "static" || normalized === "html") {
        return "static";
    }
    return "";
}

function buildProgressSteps(operationType: OperationType): ProgressStepState[] {
    switch (operationType) {
        case "deploy":
            return [
                { label: "Fetching source", status: "running" },
                { label: "Building image", status: "pending" },
                { label: "Starting candidate", status: "pending" },
                { label: "Running health checks", status: "pending" },
                { label: "Promoting traffic", status: "pending" },
            ];
        case "rollback":
            return [
                { label: "Selecting target version", status: "running" },
                { label: "Starting rollback candidate", status: "pending" },
                { label: "Running health checks", status: "pending" },
                { label: "Promoting traffic", status: "pending" },
                { label: "Finalizing rollback", status: "pending" },
            ];
        case "stop":
            return [
                { label: "Stopping Docker container", status: "running" },
                { label: "Cleaning up resources", status: "pending" },
            ];
        case "delete":
            return [
                { label: "Delete requested", status: "running" },
                { label: "Agent cleanup running", status: "pending" },
                { label: "Removing routes & domains", status: "pending" },
                { label: "Finalizing cleanup", status: "pending" },
            ];
    }
}

function progressTitle(operationType: OperationType) {
    switch (operationType) {
        case "deploy":
            return "Deploying Application";
        case "rollback":
            return "Rolling Back Deployment";
        case "stop":
            return "Stopping Application";
        case "delete":
            return "Deleting Application";
    }
}

function phaseIndex(operationType: OperationType, phase: string) {
    const normalized = phase.toLowerCase();
    if (operationType === "deploy") {
        if (normalized === "clone" || normalized === "cloning") return 0;
        if (normalized === "detecting") return 0;
        if (normalized === "build" || normalized === "building") return 1;
        if (normalized === "deploy" || normalized === "deploying") return 2;
        if (normalized === "healthcheck" || normalized === "health") return 3;
        if (normalized === "ssl" || normalized === "completed") return 4;
    }
    if (operationType === "rollback") {
        if (normalized === "clone" || normalized === "cloning") return 0;
        if (normalized === "deploy" || normalized === "deploying") return 1;
        if (normalized === "healthcheck" || normalized === "health") return 2;
        if (normalized === "ssl" || normalized === "completed") return 3;
    }
    if (operationType === "delete") {
        if (normalized === "dispatching") return 0;
        if (normalized === "running") return 1;
        if (normalized === "completed") return 2;
    }
    return null;
}

function updateStepsFromPhase(
    operationType: OperationType,
    steps: ProgressStepState[],
    phase?: string,
    status?: "running" | "completed" | "failed"
): ProgressStepState[] {
    if (!phase) {
        return steps;
    }

    const currentIndex = phaseIndex(operationType, phase);
    if (currentIndex === null || currentIndex >= steps.length) {
        return steps;
    }

    return steps.map((step, index) => {
        if (index < currentIndex) {
            return { ...step, status: "completed" };
        }

        if (index === currentIndex) {
            if (status === "failed") {
                return { ...step, status: "error" };
            }
            if (status === "completed" && currentIndex === steps.length - 1) {
                return { ...step, status: "completed" };
            }
            return { ...step, status: "running" };
        }

        return step;
    });
}

function deploymentStatusToProgressStatus(status?: DeploymentRecord["status"]): DeployProgressProps["status"] {
    if (status === "succeeded" || status === "rolled_back") {
        return "completed";
    }
    if (isTerminalDeploymentStatus(status)) {
        return "failed";
    }
    return "running";
}

function normalizeDashboardProgress(
    raw: Record<string, unknown> | null | undefined,
    fallbackStatus?: DeploymentRecord["status"]
): DeployProgressProps | null {
    if (!raw) {
        return null;
    }

    const rawPhase = raw.phase ?? raw.stage ?? "";
    const rawLine = raw.line ?? raw.description ?? "";
    const phase = typeof rawPhase === "string" ? rawPhase : "";
    const line = typeof rawLine === "string" ? rawLine : "";
    let status = raw.status === "completed" || raw.status === "failed" || raw.status === "running"
        ? raw.status
        : deploymentStatusToProgressStatus(fallbackStatus);
    const rawPercent = raw.percent ?? raw.percentage;
    if (status === "failed" && isRecoverableDeployWarningLine(line)) {
        status = "running";
    }

    if (!phase && !line) {
        return null;
    }

    return {
        phase: phase || status,
        line,
        percent: rawPercent === undefined
            ? status === "completed" || status === "failed" ? 100 : 0
            : clampProgress(rawPercent),
        status,
    };
}

function appendUniqueWarning(existing: string[], next: string) {
    const normalized = next.trim();
    if (!normalized || existing.includes(normalized)) {
        return existing;
    }
    return [...existing, normalized].slice(-5);
}

function AppDetailPageContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const appId = params.id as string;
    const [preflightState, setPreflightState] = useState<{ checks: PreflightCheck[]; deniedOverrides: string[]; riskScore?: RiskScoreResult | null } | null>(null);
    const selectedSection = normalizeAppSection(searchParams.get("section"));
    const logsSectionActive = selectedSection === "logs";
    const deploymentDataActive = true;

    const setSelectedSection = useCallback((section: AppSectionId) => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (section === "overview") {
            nextParams.delete("section");
        } else {
            nextParams.set("section", section);
        }

        const nextQuery = nextParams.toString();
        router.replace(`/apps/${appId}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    }, [appId, router, searchParams]);

    // We need to find which server this app belongs to
    // For now, we'll fetch all servers and find the app
    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
    });

    // Find the app across all servers
    const { data: appData, isLoading, error } = useQuery({
        queryKey: ["app", appId],
        queryFn: async () => {
            // Search for the app in all servers' apps
            for (const server of servers) {
                try {
                    const apps = await api.getApps(server.id);
                    const app = apps.find((a: App) => a.id === appId);
                    if (app) {
                        return { app, server };
                    }
                } catch {
                    continue;
                }
            }
            return null;
        },
        enabled: servers.length > 0,
    });

    const { data: domainData, isLoading: domainsLoading } = useQuery({
        queryKey: ["app-domains", appId],
        queryFn: () => api.getAppDomains(appId),
        enabled: !!appId,
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            return api.deleteApp(appData.server.id, appId);
        },
        onSuccess: (result) => {
            if (result?.status === "deleting") {
                queryClient.setQueryData(["app", appId], (current: typeof appData) => current
                    ? { ...current, app: { ...current.app, status: "deleting" as const } }
                    : current);
                queryClient.invalidateQueries({ queryKey: ["all-apps"] });
            }
            if (result && result.jobId) {
                pollForUpdates("delete", result.jobId);
            } else {
                queryClient.invalidateQueries({ queryKey: ["apps"] });
                router.push("/apps");
            }
        },
        onError: (deleteError) => {
            toast.error(deleteError instanceof Error ? deleteError.message : "Delete request failed");
        },
    });

    const stopMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            return api.stopApp(appData.server.id, appId);
        },
        onSuccess: (result) => {
            pollForUpdates("stop", result.jobId);
        },
    });

    const deployMutation = useMutation({
        mutationFn: async (overridePreflight?: string[]) => {
            if (!appData) throw new Error("App not found");
            return api.deployApp(appData.server.id, appId, overridePreflight ? { overridePreflight } : {});
        },
        onSuccess: (result) => {
            setPreflightState(
                result.preflightChecks?.length || result.riskScore
                    ? { checks: result.preflightChecks ?? [], deniedOverrides: [], riskScore: result.riskScore }
                    : null
            );
            pollForUpdates("deploy", result.jobId);
            queryClient.invalidateQueries({ queryKey: ["appDeployments", appId] });
        },
        onError: (deployError) => {
            if (deployError instanceof ApiRequestError && deployError.details.code === "preflight_blocked") {
                setPreflightState({
                    checks: (deployError.details.checks as PreflightCheck[]) ?? [],
                    deniedOverrides: (deployError.details.deniedOverrides as string[]) ?? [],
                });
                toast.error("Deploy blocked by preflight checks");
                return;
            }
            if (deployError instanceof ApiRequestError && deployError.details.code === "agent_disconnected") {
                toast.error("Server is disconnected — reconnect the agent before deploying");
                return;
            }
            toast.error(deployError instanceof Error ? deployError.message : "Deploy request failed");
        },
    });

    const rollbackMutation = useMutation({
        mutationFn: async (toVersion: string) => api.rollbackApp(appId, toVersion),
        onSuccess: (result) => {
            pollForUpdates("rollback", result.jobId);
            queryClient.invalidateQueries({ queryKey: ["appDeployments", appId] });
        },
        onError: (rollbackError) => {
            toast.error(rollbackError instanceof Error ? rollbackError.message : "Rollback request failed");
        },
    });

    // Env vars state and mutation
    const [envVars, setEnvVars] = useState<EnvVar[]>([]);
    const [envVarsChanged, setEnvVarsChanged] = useState(false);
    const [buildpackOverride, setBuildpackOverride] = useState<BuildpackName | "">("");
    const [healthCheckMode, setHealthCheckMode] = useState<HealthCheckMode>("auto");
    const [healthPath, setHealthPath] = useState("");
    const [registryHost, setRegistryHost] = useState("");
    const [registryUsername, setRegistryUsername] = useState("");
    const [registryPassword, setRegistryPassword] = useState("");
    const [publicStatus, setPublicStatus] = useState(false);
    const [domainValue, setDomainValue] = useState("");
    const [publicIpValue, setPublicIpValue] = useState("");
    const [domainCheck, setDomainCheck] = useState<DomainCheckResult | null>(null);
    const [rollbackTargetSha, setRollbackTargetSha] = useState<string | null>(null);

    const requestRollback = useCallback((targetSha: string) => {
        setRollbackTargetSha(targetSha);
    }, []);

    const confirmRollback = useCallback(() => {
        if (!rollbackTargetSha) {
            return;
        }
        rollbackMutation.mutate(rollbackTargetSha);
        setRollbackTargetSha(null);
    }, [rollbackMutation, rollbackTargetSha]);

    // Initialize envVars from app data
    useEffect(() => {
        if (appData?.app?.envVars) {
            setEnvVars(envRecordToMaskedList(appData.app.envVars as Record<string, string>));
        }
    }, [appData]);

    useEffect(() => {
        if (!appData?.app) {
            return;
        }

        setBuildpackOverride(normalizeBuildpackForForm(appData.app.buildpackOverride));
        setHealthCheckMode(appData.app.healthCheckMode || "auto");
        setHealthPath(appData.app.healthPath || "");
        setRegistryHost(appData.app.registryCredentials?.registry || "");
        setRegistryUsername(appData.app.registryCredentials?.username || "");
        setRegistryPassword("");
        setPublicStatus(Boolean(appData.app.publicStatus));
        setDomainValue(appData.app.domain || "");
        setPublicIpValue(appData.server.publicIp || "");
        setDomainCheck(null);
    }, [appData]);

    const updateEnvVarsMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            const envVarsObj = serializeEnvVarsForSave(
                envVars,
                appData.app.envVars as Record<string, string> | null | undefined
            );
            return api.updateAppEnvVars(appData.server.id, appId, envVarsObj);
        },
        onSuccess: () => {
            setEnvVars((current) => maskEnvVarList(current));
            setEnvVarsChanged(false);
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            toast.success("Environment variables saved");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to update env vars");
        },
    });

    // Quick-fix mutation wired to the failure card. Merges the requested
    // patch into the app's current env-var map (PATCH /apps requires a
    // full replacement) and then triggers a redeploy.
    //
    // Patch semantics:
    //   - { KEY: "value" }  → upserts the key.
    //   - { KEY: null }     → removes the key from the merged map.
    // Removal is the right action when the failure card asks to undo an
    // earlier opt-in (e.g. removing OPSLIN_NEXT_STRICT_TYPECHECK so the
    // Next buildpack falls back to the new "ignore TS errors by default"
    // behaviour), because writing `OPSLIN_NEXT_STRICT_TYPECHECK=false`
    // also works but leaves stale state in the env panel.
    const applyEnvFixMutation = useMutation({
        mutationFn: async (envPatch: Record<string, string | null>) => {
            if (!appData) throw new Error("App not found");
            const existing =
                (appData.app.envVars as Record<string, string> | null | undefined) || {};
            const merged: Record<string, string> = { ...existing };
            for (const [key, value] of Object.entries(envPatch)) {
                if (value === null) {
                    delete merged[key];
                } else {
                    merged[key] = value;
                }
            }
            return api.updateAppEnvVars(appData.server.id, appId, merged);
        },
        onSuccess: (_result, envPatch) => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            const removed = Object.entries(envPatch)
                .filter(([, v]) => v === null)
                .map(([k]) => k);
            const set = Object.entries(envPatch)
                .filter(([, v]) => v !== null)
                .map(([k]) => k);
            const parts: string[] = [];
            if (set.length) parts.push(`Set ${set.join(", ")}`);
            if (removed.length) parts.push(`Removed ${removed.join(", ")}`);
            toast.success(
                `${parts.join(" · ") || "Updated env vars"} — starting redeploy`
            );
            deployMutation.mutate(undefined);
        },
        onError: (error) => {
            toast.error(
                error instanceof Error ? error.message : "Failed to apply quick fix"
            );
        },
    });

    const updateBuildConfigMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            return api.updateApp(appData.server.id, appId, {
                buildpackOverride: buildpackOverride || null,
                registryCredentials: registryHost && registryUsername
                    ? {
                        registry: registryHost,
                        username: registryUsername,
                        password: registryPassword,
                    }
                    : { registry: "", username: "", password: "", clear: true },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            setRegistryPassword("");
            toast.success("Build configuration saved");
        },
    });

    const updateHealthSettingsMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            return api.updateApp(appData.server.id, appId, {
                healthCheckMode,
                healthPath: healthPath.trim(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            toast.success("Health check settings saved");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to update health check settings");
        },
    });

    const updatePublicStatusMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            return api.updateApp(appData.server.id, appId, {
                publicStatus,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            toast.success("Public status setting saved");
        },
    });

    const updateDomainMutation = useMutation({
        mutationFn: async (domain: string | null) => {
            if (!appData) throw new Error("App not found");
            return api.updateApp(appData.server.id, appId, {
                domain,
            });
        },
        onSuccess: (result, domain) => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            queryClient.invalidateQueries({ queryKey: ["servers"] });
            setDomainValue(domain || "");
            setDomainCheck(result.dnsCheck || null);
            if (result.routeWarning) {
                toast.warning(`Domain saved, but route apply needs attention: ${result.routeWarning}`);
                return;
            }
            if (result.dnsCheck?.status === "ready") {
                toast.success("Domain saved, DNS verified, and public route applied");
                return;
            }
            if (result.dnsCheck) {
                toast.warning(result.dnsCheck.message);
                return;
            }
            toast.success(domain
                ? "Domain saved and public route applied"
                : "Domain removed and public route updated");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to update domain");
        },
    });

    const updatePublicIpMutation = useMutation({
        mutationFn: async (publicIp: string | null) => {
            if (!appData) throw new Error("App not found");
            return api.updateServerPublicAccess(appData.server.id, { publicIp });
        },
        onSuccess: (_result, publicIp) => {
            queryClient.invalidateQueries({ queryKey: ["servers"] });
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            setPublicIpValue(publicIp || "");
            toast.success(publicIp ? "Public server IP saved" : "Public server IP removed");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to update public server IP");
        },
    });

    const testRegistryMutation = useMutation({
        mutationFn: async () => {
            if (!appData) throw new Error("App not found");
            if (!registryHost || !registryUsername || !registryPassword) {
                throw new Error("Registry host, username, and password are required");
            }
            return api.testRegistryCredentials(appData.server.id, appId, {
                registry: registryHost,
                username: registryUsername,
                password: registryPassword,
            });
        },
    });

    const handleEnvVarsChange = (newVars: EnvVar[]) => {
        setEnvVars(newVars);
        setEnvVarsChanged(true);
    };

    const [isSavingAndRedeploying, setIsSavingAndRedeploying] = useState(false);

    const saveAndRedeploy = async () => {
        try {
            setIsSavingAndRedeploying(true);
            // First save the env vars
            await updateEnvVarsMutation.mutateAsync();
            // Then trigger deploy which will show the progress modal
            deployMutation.mutate(undefined);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Save and redeploy failed");
            setIsSavingAndRedeploying(false);
        }
    };

    // Reset saving state when deploy completes
    useEffect(() => {
        if (!deployMutation.isPending && isSavingAndRedeploying) {
            setIsSavingAndRedeploying(false);
        }
    }, [deployMutation.isPending, isSavingAndRedeploying]);

    const deploymentLive = useDeploymentLive(appId, {
        enabled: !!appData && deploymentDataActive,
    });
    const deploymentPollingFallback = deploymentDataActive &&
        (deploymentLive.status !== "connected" || deploymentLive.isStale);

    const { data: deployments = [] } = useQuery({
        queryKey: ["appDeployments", appId],
        queryFn: () => api.getAppDeployments(appId),
        enabled: !!appData && deploymentDataActive,
        refetchInterval: deploymentPollingFallback || appData?.app.status === "deploying" ? 10_000 : false,
    });

    const {
        data: deployGates = [],
        isLoading: deployGatesLoading,
        refetch: refetchDeployGates,
    } = useQuery({
        queryKey: ["deployGates", appId],
        queryFn: () => api.getDeployGates(appId),
        enabled: !!appData && deploymentDataActive,
        refetchInterval: deploymentDataActive
            ? deploymentPollingFallback || appData?.app.status === "deploying" ? 10_000 : 30_000
            : false,
    });

    // Progress modal state
    const [progressModal, setProgressModal] = useState<{
        isOpen: boolean;
        title: string;
        type: OperationType;
        progress: number;
        steps: ProgressStepState[];
        deployStages: DeployStageState[];
        logLines: string[];
        latestProgress: DeployProgressProps | null;
        connectionStatus: "connecting" | "connected" | "reconnecting" | "closed";
        logs: string;
        error: string;
    }>({
        isOpen: false,
        title: "",
        type: "deploy",
        progress: 0,
        steps: [],
        deployStages: createInitialDeployStages(),
        logLines: [],
        latestProgress: null,
        connectionStatus: "closed",
        logs: "",
        error: "",
    });
    const [deploymentWarnings, setDeploymentWarnings] = useState<string[]>([]);

    // Poll for status updates during operations
    const pollForUpdates = useCallback(async (
        operationType: OperationType,
        jobId?: string
    ) => {
        if (!appData) return;

        const steps = buildProgressSteps(operationType);
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const jobSocketUrl = jobId
            ? `${apiBaseUrl.replace(/^http/, "ws")}/jobs/${jobId}/live`
            : null;

        if (operationType === "deploy" || operationType === "rollback") {
            setDeploymentWarnings([]);
        }

        setProgressModal({
            isOpen: true,
            title: progressTitle(operationType),
            type: operationType,
            progress: 10,
            steps,
            deployStages: createInitialDeployStages(),
            logLines: [],
            latestProgress: null,
            connectionStatus: jobSocketUrl ? "connecting" : "closed",
            // For delete: show helpful message instead of empty/stale logs
            logs: operationType === "delete"
                ? "Delete cleanup is running on the server. Detailed cleanup logs are not available yet."
                : "",
            error: "",
        });

        // Poll for status updates
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max
        let progressSocket: WebSocket | null = null;

        if (jobSocketUrl) {
            progressSocket = new WebSocket(jobSocketUrl);
            progressSocket.onopen = () => {
                setProgressModal((prev) => ({ ...prev, connectionStatus: "connected" }));
            };
            progressSocket.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data) as {
                        phase?: string;
                        stage?: string;
                        percent?: number;
                        percentage?: number;
                        line?: string;
                        description?: string;
                        elapsedMs?: number;
                        status?: "running" | "completed" | "failed";
                    };
                    const normalized = normalizeDeployProgressEvent(payload);
                    const dashboardProgress = normalizeDashboardProgress(payload as Record<string, unknown>);
                    const progressLine = payload.description || payload.line || "";
                    const progressSucceeded = payload.status === "completed";
                    const progressFailed = payload.status === "failed" && !isRecoverableDeployWarningLine(progressLine);
                    const progressStatus = payload.status === "failed" && isRecoverableDeployWarningLine(progressLine)
                        ? "running"
                        : payload.status;
                    if (dashboardProgress?.phase.toLowerCase() === "warning" || isRecoverableDeployWarningLine(progressLine)) {
                        setDeploymentWarnings((current) => appendUniqueWarning(current, dashboardProgress?.line || progressLine));
                    }

                    setProgressModal((prev) => ({
                        ...prev,
                        progress: typeof payload.percentage === "number"
                            ? payload.percentage
                            : typeof payload.percent === "number"
                                ? payload.percent
                                : prev.progress,
                        steps: updateStepsFromPhase(prev.type, prev.steps, payload.phase, progressStatus),
                        deployStages: normalized
                            ? applyDeployProgress(prev.deployStages, normalized)
                            : prev.deployStages,
                        latestProgress: prev.type === "deploy" || prev.type === "rollback"
                            ? dashboardProgress ?? prev.latestProgress
                            : prev.latestProgress,
                        logLines: payload.line || payload.description
                            ? appendBuildLogLines(prev.logLines, payload.description || payload.line || "")
                            : prev.logLines,
                        logs: payload.line
                            ? [prev.logs, payload.line].filter(Boolean).join("\n")
                            : prev.logs,
                        error: progressSucceeded
                            ? ""
                            : progressFailed && progressLine
                                ? parseError(progressLine)
                                : prev.error,
                    }));
                } catch {
                    // Ignore malformed progress events and keep the polling fallback active.
                }
            };
            progressSocket.onerror = () => {
                setProgressModal((prev) => ({ ...prev, connectionStatus: "reconnecting" }));
            };
            progressSocket.onclose = () => {
                setProgressModal((prev) => ({
                    ...prev,
                    connectionStatus: prev.progress >= 100 ? "closed" : "reconnecting",
                }));
            };
        }

        // Delete operations use a separate polling strategy:
        // - Do NOT fetch old deploy logs (they would show stale build output)
        // - Detect success via 404 (app row deleted after cleanup)
        // - Detect delete_failed via app status
        // - Use slower polling to avoid hammering the API
        const deleteSlowdownThreshold = 40; // ~2 min at 3s intervals, then slow down
        const deletePollInterval = operationType === "delete" ? 3000 : 1000;

        const pollInterval = setInterval(async () => {
            attempts++;

            // ---------- DELETE-specific polling ----------
            if (operationType === "delete") {
                try {
                    // Try to fetch the app — if it 404s, the delete succeeded
                    const apps = await api.getApps(appData.server.id);
                    const stillExists = apps.find((a: App) => a.id === appId);

                    if (!stillExists) {
                        // App is gone — delete succeeded
                        const completedSteps = steps.map(s => ({ ...s, status: "completed" as const }));
                        setProgressModal(prev => ({
                            ...prev,
                            progress: 100,
                            steps: completedSteps,
                            connectionStatus: "closed",
                            error: "",
                        }));
                        clearInterval(pollInterval);
                        progressSocket?.close();
                        queryClient.removeQueries({ queryKey: ["app", appId] });
                        queryClient.invalidateQueries({ queryKey: ["all-apps"] });
                        queryClient.invalidateQueries({ queryKey: ["apps"] });
                        queryClient.invalidateQueries({ queryKey: ["servers"] });
                        queryClient.removeQueries({ queryKey: ["appDeployments", appId] });
                        queryClient.removeQueries({ queryKey: ["app-domains", appId] });
                        queryClient.removeQueries({ queryKey: ["appLogs", appId] });
                        toast.success("App deleted");
                        router.push("/apps");
                        return;
                    }

                    // App still exists — check if delete_failed
                    if (stillExists.status === "delete_failed") {
                        const failedSteps = steps.map((s, i) => ({
                            ...s,
                            status: i <= 1 ? "completed" as const : i === 2 ? "error" as const : "pending" as const,
                        }));
                        const humanizedError = stillExists.deployLogs
                            ? parseError(stillExists.deployLogs)
                            : "Delete cleanup failed. You can retry from the app page.";
                        setProgressModal(prev => ({
                            ...prev,
                            progress: 100,
                            steps: failedSteps,
                            connectionStatus: "closed",
                            error: humanizedError,
                        }));
                        clearInterval(pollInterval);
                        progressSocket?.close();
                        queryClient.invalidateQueries({ queryKey: ["app", appId] });
                        queryClient.invalidateQueries({ queryKey: ["all-apps"] });
                        // Surface the failure as a toast so a user who left
                        // the app detail page (or whose modal is hidden
                        // behind another tab) still gets an in-app
                        // notification — the original UX defect was that
                        // async delete failures had no notification path.
                        toast.error(humanizedError);
                        return;
                    }

                    // Still deleting — advance progress gradually
                    const deleteProgress = Math.min(90, 20 + attempts * 2);
                    const deleteStepIndex = attempts < 5 ? 0 : attempts < 15 ? 1 : attempts < 25 ? 2 : 3;
                    const updatedDeleteSteps = steps.map((s, i) => ({
                        ...s,
                        status: i < deleteStepIndex ? "completed" as const
                            : i === deleteStepIndex ? "running" as const
                            : "pending" as const,
                    }));

                    setProgressModal(prev => ({
                        ...prev,
                        progress: deleteProgress,
                        steps: updatedDeleteSteps,
                    }));

                    // After threshold: show "still running" message
                    if (attempts === deleteSlowdownThreshold) {
                        setProgressModal(prev => ({
                            ...prev,
                            logs: "Delete is still running. Refreshing status...",
                        }));
                    }

                    if (attempts >= maxAttempts) {
                        // Make the modal dismissible: set both `error` and
                        // `progress: 100` so the Done button renders and
                        // the user is not trapped in an uncloseable
                        // "Deleting…" state. The original code only set
                        // `connectionStatus: "closed"` and a log line,
                        // which left the modal locked open.
                        const timedOutSteps = steps.map((s, i) => ({
                            ...s,
                            status: i < 2 ? "completed" as const : i === 2 ? "error" as const : "pending" as const,
                        }));
                        const timeoutMessage =
                            "Delete is taking longer than expected. We stopped watching after 3 minutes. " +
                            "Refresh the app list to see the current status, or click Retry Cleanup if it failed.";
                        setProgressModal(prev => ({
                            ...prev,
                            progress: 100,
                            steps: timedOutSteps,
                            connectionStatus: "closed",
                            error: timeoutMessage,
                        }));
                        clearInterval(pollInterval);
                        progressSocket?.close();
                        queryClient.invalidateQueries({ queryKey: ["app", appId] });
                        queryClient.invalidateQueries({ queryKey: ["all-apps"] });
                        toast.error(timeoutMessage);
                    }
                } catch (deleteError) {
                    // 404 means app was deleted — treat as success
                    if (deleteError instanceof ApiRequestError && deleteError.status === 404) {
                        const completedSteps = steps.map(s => ({ ...s, status: "completed" as const }));
                        setProgressModal(prev => ({
                            ...prev,
                            progress: 100,
                            steps: completedSteps,
                            connectionStatus: "closed",
                            error: "",
                        }));
                        clearInterval(pollInterval);
                        progressSocket?.close();
                        queryClient.removeQueries({ queryKey: ["app", appId] });
                        queryClient.invalidateQueries({ queryKey: ["all-apps"] });
                        queryClient.invalidateQueries({ queryKey: ["apps"] });
                        queryClient.invalidateQueries({ queryKey: ["servers"] });
                        queryClient.removeQueries({ queryKey: ["appDeployments", appId] });
                        queryClient.removeQueries({ queryKey: ["app-domains", appId] });
                        queryClient.removeQueries({ queryKey: ["appLogs", appId] });
                        toast.success("App deleted");
                        router.push("/apps");
                        return;
                    }
                    // Other errors — continue polling
                }
                return;
            }

            // ---------- Deploy / stop / rollback polling (unchanged) ----------
            try {
                const logs = await api.getAppLogs(appData.server.id, appId);
                const currentLogs = logs.logs || "";

                // Parse logs to determine current step
                let currentStep = 0;
                let progress = 20;

                if (operationType === "deploy") {
                    if (currentLogs.includes("Downloaded") || currentLogs.includes("Downloading")) {
                        currentStep = 1;
                        progress = 30;
                    }
                    if (currentLogs.includes("Found") || currentLogs.includes("Detected")) {
                        currentStep = 2;
                        progress = 45;
                    }
                    if (currentLogs.includes("Building") || currentLogs.includes("docker-compose")) {
                        currentStep = 3;
                        progress = 60;
                    }
                    if (currentLogs.includes("Starting") || currentLogs.includes("Creating")) {
                        currentStep = 4;
                        progress = 80;
                    }
                    if (currentLogs.includes("success") || logs.status === "running") {
                        currentStep = 5;
                        progress = 100;
                    }
                } else if (operationType === "stop") {
                    if (currentLogs.includes("Stopping") || currentLogs.includes("docker-compose")) {
                        currentStep = 1;
                        progress = 50;
                    }
                    if (currentLogs.includes("stopped") || logs.status === "stopped") {
                        currentStep = 2;
                        progress = 100;
                    }
                }

                const updatedSteps: ProgressStepState[] = steps.map((step, i) => ({
                    ...step,
                    status: i < currentStep ? "completed" as const :
                        i === currentStep ? "running" as const : "pending" as const,
                }));

                const warningLines = collectRecoverableDeployWarnings(currentLogs);
                if (warningLines.length > 0 && !isTerminalDeploymentStatus(logs.status)) {
                    setDeploymentWarnings((current) =>
                        warningLines.reduce(appendUniqueWarning, current)
                    );
                }

                // Check for completion or terminal failure. Raw log text can contain
                // recoverable "failed" lines while the deployment is still progressing.
                const operationSucceeded = isSuccessfulOperationStatus(operationType, logs.status);
                const hasError = isTerminalDeploymentStatus(logs.status);
                const isComplete = operationSucceeded || hasError;

                if (hasError) {
                    updatedSteps[currentStep] = { ...updatedSteps[currentStep], status: "error" };
                    setProgressModal(prev => ({
                        ...prev,
                        progress: 100,
                        steps: updatedSteps,
                        deployStages: applyDeployProgress(prev.deployStages, {
                            stage: "health",
                            percentage: 100,
                            description: parseError(currentLogs),
                            status: "failed",
                            elapsedMs: 0,
                        }),
                        logLines: appendBuildLogLines([], currentLogs),
                        latestProgress: operationType === "deploy" || operationType === "rollback"
                            ? {
                                phase: "failed",
                                line: parseError(currentLogs),
                                percent: 100,
                                status: "failed",
                            }
                            : prev.latestProgress,
                        logs: currentLogs,
                        error: parseError(currentLogs),
                    }));
                    clearInterval(pollInterval);
                    progressSocket?.close();
                    queryClient.invalidateQueries({ queryKey: ["app", appId] });
                    return;
                }

                setProgressModal(prev => ({
                    ...prev,
                    progress,
                    steps: updatedSteps,
                    logLines: currentLogs ? appendBuildLogLines([], currentLogs) : prev.logLines,
                    logs: currentLogs,
                }));

                if (isComplete && !hasError) {
                    updatedSteps.forEach((_, i) => {
                        updatedSteps[i] = { ...updatedSteps[i], status: "completed" };
                    });
                    setProgressModal(prev => ({
                        ...prev,
                        progress: 100,
                        steps: updatedSteps,
                        deployStages: applyDeployProgress(prev.deployStages, {
                            stage: "completed",
                            percentage: 100,
                            description: "Deployment completed",
                            status: "completed",
                            elapsedMs: 0,
                        }),
                        logLines: currentLogs ? appendBuildLogLines([], currentLogs) : prev.logLines,
                        connectionStatus: "closed",
                        latestProgress: operationType === "deploy" || operationType === "rollback"
                            ? {
                                phase: "completed",
                                line: "Deployment completed",
                                percent: 100,
                                status: "completed",
                            }
                            : prev.latestProgress,
                        logs: currentLogs,
                        error: "",
                    }));
                    clearInterval(pollInterval);
                    progressSocket?.close();
                    queryClient.invalidateQueries({ queryKey: ["app", appId] });
                    queryClient.invalidateQueries({ queryKey: ["appDeployments", appId] });
                    if (logsSectionActive) {
                        queryClient.invalidateQueries({ queryKey: ["appLogs", appId] });
                    }
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    progressSocket?.close();
                }
            } catch {
                // Continue polling
            }
        }, deletePollInterval);
    }, [appData, appId, logsSectionActive, queryClient, router]);

    const closeProgressModal = useCallback(() => {
        setProgressModal(prev => ({ ...prev, isOpen: false }));
        if (progressModal.type === "delete") {
            queryClient.invalidateQueries({ queryKey: ["apps"] });
            router.push("/apps");
        } else {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            queryClient.invalidateQueries({ queryKey: ["appLogs", appId] });
            queryClient.invalidateQueries({ queryKey: ["appDeployments", appId] });
        }
    }, [appId, queryClient, router, progressModal.type]);

    useEffect(() => {
        const handleCommandAction = (event: Event) => {
            const detail = (event as CustomEvent<{ action?: string }>).detail;
            if (!detail?.action || !appData) {
                return;
            }

            if (detail.action === "deploy") {
                deployMutation.mutate(undefined);
                return;
            }

            if (detail.action === "stop") {
                stopMutation.mutate();
                return;
            }

            if (detail.action === "rollback") {
                const target = deployments.find((deployment) =>
                    ["succeeded", "rolled_back"].includes(deployment.status) &&
                    deployment.sha !== deployments[0]?.sha
                );
                if (target) {
                    requestRollback(target.sha);
                }
                return;
            }

            if (detail.action === "open-logs") {
                setSelectedSection("logs");
                window.setTimeout(() => {
                    document.getElementById("deployment-logs")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                }, 0);
            }
        };

        window.addEventListener("opslin:command-action", handleCommandAction as EventListener);
        return () => window.removeEventListener("opslin:command-action", handleCommandAction as EventListener);
    }, [appData, deployments, deployMutation, requestRollback, setSelectedSection, stopMutation]);

    const activeDeployGate = useMemo(
        () => deployGates.find((gate) => gate.enabled) ?? deployGates[0] ?? null,
        [deployGates]
    );
    const latestDeployment = useMemo(
        () => selectCurrentDeploymentTruth(deployments, activeDeployGate?.lastCiRun ?? null) ??
            deployments[0] ??
            activeDeployGate?.lastDeployment ??
            null,
        [activeDeployGate, deployments]
    );
    const cachedDeployProgress = useMemo(
        () => normalizeDashboardProgress(latestDeployment?.queue?.progress, latestDeployment?.status),
        [latestDeployment]
    );
    const liveDeployProgress = progressModal.isOpen &&
        (progressModal.type === "deploy" || progressModal.type === "rollback") &&
        progressModal.latestProgress
        ? progressModal.latestProgress
        : cachedDeployProgress;

    useEffect(() => {
        if (cachedDeployProgress?.phase.toLowerCase() === "warning") {
            setDeploymentWarnings((current) => appendUniqueWarning(current, cachedDeployProgress.line));
        }
    }, [cachedDeployProgress]);

    if (isLoading || servers.length === 0) {
        return (
            <>
                <Header title="Loading..." />
                <div className="p-6">
                    <div className="animate-pulse space-y-4">
                        <div className="h-32 bg-muted rounded-lg" />
                        <div className="h-48 bg-muted rounded-lg" />
                    </div>
                </div>
            </>
        );
    }

    if (error || !appData) {
        return (
            <>
                <Header title="App Not Found" />
                <div className="p-6">
                    <Card className="max-w-lg mx-auto">
                        <CardContent className="pt-6 text-center">
                            <Box className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground mb-4">This application could not be found.</p>
                            <Button asChild>
                                <Link href="/apps">Back to Apps</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    const { app, server } = appData;
    const currentDeployMode: DeployMode = activeDeployGate?.enabled
        ? activeDeployGate.mode === "safe_with_health"
            ? "safe_with_health"
            : "safe"
        : "fast";
    const latestCheckReport = latestDeployment?.checkReport ?? activeDeployGate?.lastDeployment?.checkReport ?? null;
    const repoFullName = activeDeployGate?.repoFullName ?? repoFullNameFromGitUrl(app.gitUrl) ?? "";
    const access = appAccessUrl(app, server);
    const runningWithoutUrl = app.status === "running" && !access;
    const missingAccessTitle = runningWithoutUrl ? "Running, but no URL reported" : "No runnable URL yet";
    const missingAccessHelp = runningWithoutUrl
        ? "The app status is RUNNING, but the agent has not reported a host port and no domain is configured. Redeploy the app or check the agent deploy logs so Opslin can persist the access URL."
        : "Deploy or start the app first. After the agent reports a running port or a domain is configured, the URL appears here.";
    const missingAccessAction = runningWithoutUrl ? "No port/domain reported" : "Waiting for deploy";
    const latestDeploymentFailed = latestDeployment
        ? latestDeployment.status === "failed" || latestDeployment.status === "aborted"
        : false;
    const deployErrorClassification = latestDeploymentFailed
        ? latestDeployment?.errorClassification ?? null
        : null;
    const deployErrorRaw = latestDeploymentFailed
        ? latestDeployment?.healthLog || app.deployLogs || null
        : null;
    const isDeleting = app.status === "deleting";
    const isDeleteFailed = app.status === "delete_failed";
    const deleteLocked = isDeleting || isDeleteFailed;
    const deleteFailureReason = isDeleteFailed
        ? app.deployLogs || null
        : null;
    const retryDeleteCleanup = () => deleteMutation.mutate();
    const previousVersionStillRunning = latestDeploymentFailed && app.status === "running";
    const warningLinesToRender = deploymentWarnings.filter((warning) =>
        !(liveDeployProgress?.phase.toLowerCase() === "warning" && liveDeployProgress.line === warning)
    );
    const showDeployProgressPanel = Boolean(liveDeployProgress) ||
        deploymentWarnings.length > 0 ||
        latestDeploymentFailed;

    return (
        <>
            <AppHeader
                app={app}
                server={server}
                deleteFailureReason={deleteFailureReason}
                deployPending={deployMutation.isPending}
                stopPending={stopMutation.isPending}
                deletePending={deleteMutation.isPending}
                onDeploy={() => deployMutation.mutate(undefined)}
                onStop={() => stopMutation.mutate()}
                onDelete={() => deleteMutation.mutate()}
                onRetryDeleteCleanup={retryDeleteCleanup}
            />

            <div className="p-6 space-y-6">
                <AppSectionNav value={selectedSection} onValueChange={setSelectedSection} />

                {preflightState && (
                    <PreflightChecksPanel
                        checks={preflightState.checks}
                        deniedOverrides={preflightState.deniedOverrides}
                        riskScore={preflightState.riskScore}
                        orgRole={user?.orgRole}
                        pending={deployMutation.isPending}
                        onOverrideAndDeploy={(checkIds) => deployMutation.mutate(checkIds)}
                    />
                )}

                {showDeployProgressPanel && (
                    <Card className="border-border shadow-sm">
                        <CardContent className="space-y-4 p-4">
                            {liveDeployProgress ? (
                                <DeployProgressIndicator
                                    phase={liveDeployProgress.phase}
                                    line={liveDeployProgress.line}
                                    percent={liveDeployProgress.percent}
                                    status={liveDeployProgress.status}
                                />
                            ) : latestDeploymentFailed ? (
                                <DeployProgressIndicator
                                    phase="failed"
                                    line={parseError(deployErrorRaw || "Deployment failed")}
                                    percent={100}
                                    status="failed"
                                />
                            ) : null}

                            {warningLinesToRender.length > 0 && (
                                <div className="space-y-2">
                                    {warningLinesToRender.map((warning) => (
                                        <DeployProgressIndicator
                                            key={warning}
                                            phase="warning"
                                            line={warning}
                                            percent={liveDeployProgress?.percent ?? 0}
                                            status="running"
                                        />
                                    ))}
                                </div>
                            )}

                            {previousVersionStillRunning ? (
                                <PreviousVersionRunningNotice
                                    details={deployErrorRaw}
                                    onRetry={() => deployMutation.mutate(undefined)}
                                    retryPending={deployMutation.isPending}
                                />
                            ) : latestDeploymentFailed ? (
                                <div className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm font-medium text-danger-text">Deployment is in a failed state.</p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => deployMutation.mutate(undefined)}
                                            disabled={deployMutation.isPending}
                                        >
                                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                            {deployMutation.isPending ? "Retrying..." : "Retry Deploy"}
                                        </Button>
                                    </div>
                                    {deployErrorRaw && (
                                        <details className="group mt-3 rounded-md border border-danger/15 bg-card/70 px-3 py-2">
                                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-danger-text">
                                                Failure details
                                                <span className="text-xs text-danger/80 group-open:hidden">Show</span>
                                                <span className="hidden text-xs text-danger/80 group-open:inline">Hide</span>
                                            </summary>
                                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80">
                                                {deployErrorRaw}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                )}

                <div className="space-y-6">
                    {selectedSection === "overview" && (
                        <OverviewSection
                            app={app}
                            server={server}
                            domainData={domainData}
                            domainsLoading={domainsLoading}
                            latestDeployment={latestDeployment}
                            rollbackTarget={deployments.find((deployment) =>
                                ["succeeded", "rolled_back"].includes(deployment.status) &&
                                deployment.sha !== deployments[0]?.sha
                            ) ?? null}
                            deployErrorClassification={deployErrorClassification}
                            deployErrorRaw={deployErrorRaw}
                            deleteFailureReason={deleteFailureReason}
                            deployPending={deployMutation.isPending}
                            rollbackPending={rollbackMutation.isPending}
                            deletePending={deleteMutation.isPending}
                            deleteLocked={deleteLocked}
                            onDeploy={() => deployMutation.mutate(undefined)}
                            onViewLogs={() => setSelectedSection("logs")}
                            onRollback={requestRollback}
                            onRetryDeleteCleanup={retryDeleteCleanup}
                            onApplyEnvFix={(envPatch) => applyEnvFixMutation.mutate(envPatch)}
                            quickFixPending={applyEnvFixMutation.isPending}
                        />
                    )}

                    {selectedSection === "deployments" && (
                        <DeploymentsSection
                            app={app}
                            server={server}
                            appId={appId}
                            deployments={deployments}
                            activeDeployGate={activeDeployGate}
                            deployGatesLoading={deployGatesLoading}
                            currentDeployMode={currentDeployMode}
                            repoFullName={repoFullName}
                            latestDeployment={latestDeployment}
                            latestCheckReport={latestCheckReport}
                            deployErrorClassification={deployErrorClassification}
                            deployErrorRaw={deployErrorRaw}
                            liveStatus={deploymentLive.status}
                            liveLastEventAt={deploymentLive.lastEventAt}
                            pollingFallback={deploymentPollingFallback}
                            appUrl={access?.url ?? null}
                            deployPending={deployMutation.isPending}
                            rollbackPending={rollbackMutation.isPending}
                            deleteLocked={deleteLocked}
                            onDeploy={() => deployMutation.mutate(undefined)}
                            onViewLogs={() => setSelectedSection("logs")}
                            onRollback={requestRollback}
                            onSetupComplete={() => {
                                void refetchDeployGates();
                                queryClient.invalidateQueries({ queryKey: ["deployGates", appId] });
                            }}
                            onApplyEnvFix={(envPatch) => applyEnvFixMutation.mutate(envPatch)}
                            quickFixPending={applyEnvFixMutation.isPending}
                        />
                    )}

                    {selectedSection === "domains" && (
                        <DomainsSection
                            app={app}
                            server={server}
                            appId={appId}
                            domainData={domainData}
                            domainsLoading={domainsLoading}
                            access={access}
                            missingAccessTitle={missingAccessTitle}
                            missingAccessHelp={missingAccessHelp}
                            missingAccessAction={missingAccessAction}
                            domainValue={domainValue}
                            onDomainChange={setDomainValue}
                            onSaveDomain={(domain) => updateDomainMutation.mutate(domain)}
                            isSavingDomain={updateDomainMutation.isPending}
                            publicIpValue={publicIpValue}
                            onPublicIpChange={setPublicIpValue}
                            onSavePublicIp={(publicIp) => updatePublicIpMutation.mutate(publicIp)}
                            isSavingPublicIp={updatePublicIpMutation.isPending}
                            domainCheck={domainCheck}
                            deleteLocked={deleteLocked}
                        />
                    )}

                    {selectedSection === "environment" && (
                        <EnvironmentSection
                            appStatus={app.status}
                            serverId={appData.server.id}
                            envVars={envVars}
                            envVarsChanged={envVarsChanged}
                            deleteLocked={deleteLocked}
                            savePending={updateEnvVarsMutation.isPending}
                            saveAndRedeployPending={isSavingAndRedeploying}
                            deployPending={deployMutation.isPending}
                            onChange={handleEnvVarsChange}
                            onSave={() => updateEnvVarsMutation.mutate()}
                            onSaveAndRedeploy={saveAndRedeploy}
                        />
                    )}

                    {selectedSection === "logs" && (
                        <LogsSection
                            appId={appId}
                            appName={app.name}
                            server={server}
                            active={selectedSection === "logs"}
                        />
                    )}

                    {selectedSection === "metrics" && (
                        <MetricsSection
                            appId={appId}
                            serverId={server.id}
                            deployments={deployments}
                            active={selectedSection === "metrics"}
                        />
                    )}

                    {selectedSection === "settings" && (
                        <SettingsSection
                            app={app}
                            server={server}
                            buildpackOverride={buildpackOverride}
                            onBuildpackOverrideChange={setBuildpackOverride}
                            healthCheckMode={healthCheckMode}
                            onHealthCheckModeChange={setHealthCheckMode}
                            healthPath={healthPath}
                            onHealthPathChange={setHealthPath}
                            registryHost={registryHost}
                            onRegistryHostChange={setRegistryHost}
                            registryUsername={registryUsername}
                            onRegistryUsernameChange={setRegistryUsername}
                            registryPassword={registryPassword}
                            onRegistryPasswordChange={setRegistryPassword}
                            publicStatus={publicStatus}
                            onPublicStatusChange={setPublicStatus}
                            deleteFailureReason={deleteFailureReason}
                            deleteLocked={deleteLocked}
                            deletePending={deleteMutation.isPending}
                            buildConfigPending={updateBuildConfigMutation.isPending}
                            healthSettingsPending={updateHealthSettingsMutation.isPending}
                            publicStatusPending={updatePublicStatusMutation.isPending}
                            registryTestPending={testRegistryMutation.isPending}
                            registryTestResult={testRegistryMutation.data ?? null}
                            registryTestError={testRegistryMutation.error}
                            buildConfigError={updateBuildConfigMutation.error}
                            healthSettingsError={updateHealthSettingsMutation.error}
                            publicStatusError={updatePublicStatusMutation.error}
                            onSaveBuildConfig={() => updateBuildConfigMutation.mutate()}
                            onSaveHealthSettings={() => updateHealthSettingsMutation.mutate()}
                            onTestRegistry={() => testRegistryMutation.mutate()}
                            onSavePublicStatus={() => updatePublicStatusMutation.mutate()}
                            onDelete={() => deleteMutation.mutate()}
                            onRetryDeleteCleanup={retryDeleteCleanup}
                        />
                    )}

                    {selectedSection === "security" && (
                        <AppSecurityPage appId={appId} embedded />
                    )}
                </div>
            </div>

            {/* Unified deploy live view, overlay mode (doc 04 §2) — full-screen
                glass presentation at the deploy/rollback trigger moment.
                Replaces the old gsap CinematicDeployOverlay. */}
            <DeployLiveView
                mode="overlay"
                appId={appId}
                deploymentId={latestDeployment?.id ?? null}
                appName={app.name}
                appDomain={app.domain || app.primaryDomain || ""}
                serverName={server.name}
                serverConnected={server.isLiveConnected}
                logs={progressModal.logs || null}
                onRetry={() => deployMutation.mutate(undefined)}
                onRollback={
                    latestDeployment?.previousSha
                        ? () => requestRollback(latestDeployment.previousSha as string)
                        : undefined
                }
                rollbackAvailable={Boolean(latestDeployment?.previousSha)}
                rollbackPending={rollbackMutation.isPending}
                enabled={progressModal.isOpen && (progressModal.type === "deploy" || progressModal.type === "rollback")}
                onDismiss={closeProgressModal}
            />

            {/* Legacy progress modal for stop/delete operations */}
            {progressModal.isOpen && progressModal.type !== "deploy" && progressModal.type !== "rollback" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/40 p-4">
                    <div className="w-full max-w-3xl rounded-xl bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    {progressModal.type === "stop" ? <StopCircle className="h-5 w-5" /> :
                                        <Trash2 className="h-5 w-5" />}
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-foreground">{progressModal.title}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {progressModal.type === "delete"
                                            ? "Cleaning up app resources on the server"
                                            : "Stopping application on the server"}
                                    </p>
                                </div>
                            </div>
                            {(progressModal.progress >= 100 || progressModal.error) && (
                                <Button type="button" variant="outline" onClick={closeProgressModal}>
                                    Done
                                </Button>
                            )}
                        </div>
                        <div className="max-h-[80vh] overflow-auto p-5">
                            <ProgressModal
                                isOpen={true}
                                title={progressModal.title}
                                steps={progressModal.steps}
                                logs={progressModal.logs || undefined}
                                error={progressModal.error || undefined}
                                progress={progressModal.progress}
                            />
                        </div>
                    </div>
                </div>
            )}

            <RollbackConfirmDialog
                open={Boolean(rollbackTargetSha)}
                targetSha={rollbackTargetSha}
                pending={rollbackMutation.isPending}
                onOpenChange={(open) => {
                    if (!open) {
                        setRollbackTargetSha(null);
                    }
                }}
                onConfirm={confirmRollback}
            />
        </>
    );
}

export default function AppDetailPage() {
    return (
        <Suspense fallback={null}>
            <AppDetailPageContent />
        </Suspense>
    );
}
