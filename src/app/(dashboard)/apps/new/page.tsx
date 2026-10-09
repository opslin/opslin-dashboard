"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    ArrowLeft, Check, ChevronDown, CircleDashed, CloudUpload, ExternalLink, Eye, EyeOff, File as FileIcon, FolderGit2, Github, Link2,
    Loader2, Rocket, Search, Settings2, Sparkles, X,
} from "lucide-react";
import JSZip from "jszip";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnvVarsEditor, EnvVar } from "@/components/ui/env-vars-editor";
import { UpgradePrompt } from "@/components/pricing/upgrade-prompt";
import { NoServerFlow } from "@/components/setup/setup-ui";
import { ApiRequestError, api, type AutoDeployResult, type BuildpackName, type HealthCheckMode, type ManifestEntryRecord, type ServerJobStatus } from "@/lib/api";
import { generateAppNameFromGitUrl } from "@/lib/onboarding";
import { cn, formatRelativeTime } from "@/lib/utils";

const CHUNK_SIZE = 5 * 1024 * 1024;

const buildpackOptions: Array<{ value: BuildpackName | ""; label: string }> = [
    { value: "", label: "Auto-detect" },
    { value: "node", label: "Node.js / React / Vite / Next.js / Angular" },
    { value: "python", label: "Python" },
    { value: "go", label: "Go" },
    { value: "php", label: "PHP" },
    { value: "ruby", label: "Ruby" },
    { value: "java", label: "Java" },
    { value: "rust", label: "Rust" },
    { value: "static", label: "Static Site" },
];

function describeAutoDeployFailure(result: AutoDeployResult): string {
    const reasons = result.units
        .filter((unit) => unit.outcome.stage !== "done")
        .map((unit) => `${unit.unitPath || "app"}: ${(unit.outcome as { reason?: string }).reason ?? "failed"}`);
    return reasons.length > 0
        ? `AI-assisted deploy could not complete: ${reasons.join("; ")}`
        : "AI-assisted deploy could not complete.";
}

async function sha256Hex(buffer: ArrayBuffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function buildArchive(files: FileList) {
    const selected = Array.from(files);
    const zip = new JSZip();
    const manifest: ManifestEntryRecord[] = [];
    for (const file of selected) {
        const relativePath = file.webkitRelativePath || file.name;
        const bytes = await file.arrayBuffer();
        zip.file(relativePath, bytes);
        manifest.push({ path: relativePath.replace(/\\/g, "/"), sha256: await sha256Hex(bytes), size: file.size });
    }
    const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const archiveSha256 = await sha256Hex(await archive.arrayBuffer());
    return { archive, archiveSha256, filename: "upload.zip", manifest };
}

async function uploadArchiveResumable(
    appId: string,
    archive: Blob,
    archiveSha256: string,
    manifest: ManifestEntryRecord[],
    onProgress: (progress: number, label: string) => void
) {
    const storageKey = `opslin-upload:${appId}:${archiveSha256}`;
    const existingUploadId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    let uploadId = existingUploadId;
    if (!uploadId) {
        const session = await api.createUploadSession(appId, {
            filename: "upload.zip", uploadLength: archive.size, archiveSha256, manifest, mode: "full",
        });
        uploadId = session.id;
        localStorage.setItem(storageKey, uploadId);
    }
    const head = await api.getUploadSession(uploadId);
    const startChunk = Math.floor(head.uploadOffset / CHUNK_SIZE);
    const totalChunks = Math.ceil(archive.size / CHUNK_SIZE);
    const pending = Array.from({ length: totalChunks - startChunk }, (_, i) => startChunk + i);
    let completed = startChunk;
    const worker = async () => {
        while (pending.length > 0) {
            const next = pending.shift();
            if (next === undefined) return;
            const offset = next * CHUNK_SIZE;
            const chunk = archive.slice(offset, Math.min(offset + CHUNK_SIZE, archive.size));
            await api.uploadChunk(uploadId!, archive.size, offset, chunk);
            completed += 1;
            onProgress(Math.min(0.99, completed / totalChunks), `Uploaded chunk ${completed} of ${totalChunks}`);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    onProgress(1, "Upload complete");
    localStorage.removeItem(storageKey);
    return uploadId;
}


// ---------------------------------------------------------------------------
// Two-step deploy flow: 1) Import (pick the code)  2) Review & deploy.
// Everything else (detection, server choice, domains, health checks, Docker
// overrides) is automatic or tucked into "Optional settings".
// ---------------------------------------------------------------------------

type SourceType = "github" | "upload" | "git";
type FlowStep = "import" | "deploy";

const LANGUAGE_DOT: Record<string, string> = {
    typescript: "bg-primary",
    javascript: "bg-warning",
    python: "bg-warning",
    go: "bg-chart-sky",
    rust: "bg-danger",
    ruby: "bg-danger",
    java: "bg-info",
    php: "bg-chart-violet",
};

function repoSlug(gitUrl: string) {
    const parts = gitUrl.trim().replace(/\.git$/i, "").split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : gitUrl.trim();
}

function Stepper({ step }: { step: FlowStep }) {
    const importDone = step === "deploy";
    return (
        <ol aria-label="Progress" className="flex items-center justify-center gap-3 text-sm">
            <li className="flex items-center gap-2" aria-current={step === "import" ? "step" : undefined}>
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {importDone ? <Check className="size-4" aria-hidden="true" /> : "1"}
                </span>
                <span className={cn("font-medium", step === "import" ? "text-foreground" : "text-muted-foreground")}>Import</span>
            </li>
            <span className="h-px w-8 bg-border" aria-hidden="true" />
            <li className="flex items-center gap-2" aria-current={step === "deploy" ? "step" : undefined}>
                <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", step === "deploy" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</span>
                <span className={cn("font-medium", step === "deploy" ? "text-foreground" : "text-muted-foreground")}>Deploy</span>
            </li>
        </ol>
    );
}

type TimelineState = "done" | "active" | "pending";
type TimelineItem = { label: string; state: TimelineState; detail?: string | null };

function DeployingView({ name, percent, items }: { name: string; percent: number | null; items: TimelineItem[] }) {
    return (
        <div className="space-y-6" data-testid="deploying-view">
            <div className="space-y-3 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Deploying {name}…</h1>
                <div className="flex items-center gap-3">
                    <Progress value={percent ?? 8} className={cn("h-2 bg-muted", percent === null && "animate-pulse")} aria-label="Deploy progress" />
                    {percent !== null ? <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{Math.round(percent)}%</span> : null}
                </div>
            </div>
            <Card className="gap-0 py-0">
                <CardContent className="p-6">
                    <ol className="space-y-5">
                        {items.map((item, index) => (
                            <li key={item.label} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                    <span
                                        className={cn(
                                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                                            item.state === "done" && "bg-success text-success-foreground",
                                            item.state === "active" && "text-primary",
                                            item.state === "pending" && "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {item.state === "done" ? <Check className="size-4" aria-hidden="true" /> : item.state === "active" ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <CircleDashed className="size-4" aria-hidden="true" />}
                                    </span>
                                    {index < items.length - 1 ? <span className="mt-1 h-full min-h-4 w-px bg-border" aria-hidden="true" /> : null}
                                </div>
                                <div className="min-w-0 flex-1 pb-1">
                                    <p className={cn("text-[15px] font-medium", item.state === "pending" ? "text-muted-foreground" : "text-foreground")}>
                                        {item.label}
                                        {item.state === "pending" ? <span className="sr-only"> (pending)</span> : null}
                                    </p>
                                    {item.state === "active" && item.detail ? (
                                        <p className="mt-2 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">› {item.detail}</p>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ol>
                </CardContent>
            </Card>
        </div>
    );
}

function NewAppPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialServerId = searchParams.get("server");

    const [step, setStep] = useState<FlowStep>("import");
    const [sourceType, setSourceType] = useState<SourceType>("github");
    const [name, setName] = useState("");
    const [nameEdited, setNameEdited] = useState(false);
    const [domain, setDomain] = useState("");
    const [envVars, setEnvVars] = useState<EnvVar[]>([]);
    const [optionalOpen, setOptionalOpen] = useState(false);
    const [buildpackOverride, setBuildpackOverride] = useState<BuildpackName | "">("");
    const [healthCheckMode, setHealthCheckMode] = useState<HealthCheckMode>("auto");
    const [healthPath, setHealthPath] = useState("/health");
    const [dockerfileOverride, setDockerfileOverride] = useState("");
    const [registry, setRegistry] = useState("ghcr.io");
    const [registryUsername, setRegistryUsername] = useState("");
    const [registryPassword, setRegistryPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLabel, setUploadLabel] = useState("");
    const [gitPhase, setGitPhase] = useState<"creating" | "starting">("creating");
    const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
    const [upgradePromptDetails, setUpgradePromptDetails] = useState<Record<string, unknown> | null>(null);

    const [files, setFiles] = useState<FileList | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const stripInputRef = useRef<HTMLInputElement>(null);
    const [gitUrl, setGitUrl] = useState("");
    const [branch, setBranch] = useState("main");
    const [githubInstallationId, setGithubInstallationId] = useState<string | null>(null);
    const [repoSearchQuery, setRepoSearchQuery] = useState("");
    const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);
    const [changingServer, setChangingServer] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const { data: servers = [], isLoading: serversLoading } = useQuery({ queryKey: ["servers"], queryFn: () => api.getServers() });
    const { data: reposData } = useQuery({ queryKey: ["github", "repos"], queryFn: () => api.getGitHubRepositories(), retry: false });
    const repositories = useMemo(() => reposData?.repositories ?? [], [reposData]);

    // The server is picked for the person: the one from ?server=, else the first connected one.
    const [selectedServerId, setSelectedServerId] = useState(initialServerId || "");
    const connectedServers = servers.filter((s) => s.status === "connected" || s.isLiveConnected);
    const serverId = connectedServers.find((s) => s.id === selectedServerId)?.id ?? connectedServers[0]?.id ?? "";
    const selectedServerData = servers.find((s) => s.id === serverId);

    const generatedName = useMemo(() => {
        if (sourceType === "upload" && files?.[0]?.name) return generateAppNameFromGitUrl(files[0].name);
        return generateAppNameFromGitUrl(gitUrl);
    }, [files, gitUrl, sourceType]);
    const displayName = nameEdited ? name : generatedName === "app" ? "" : generatedName;
    const finalName = (nameEdited ? name.trim() : "") || generatedName;

    const filteredRepos = useMemo(() => {
        const q = repoSearchQuery.trim().toLowerCase();
        if (!q) return repositories;
        return repositories.filter((r) => r.fullName.toLowerCase().includes(q) || (r.language || "").toLowerCase().includes(q));
    }, [repositories, repoSearchQuery]);
    const selectedRepo = repositories.find((r) => `${r.installationId}:${r.fullName}` === selectedRepoKey) ?? null;

    const envVarsObject = () => envVars.reduce((acc, v) => { if (v.key) acc[v.key] = v.value; return acc; }, {} as Record<string, string>);

    const isPricingUpgradeError = (error: unknown) => {
        if (!(error instanceof ApiRequestError)) return false;
        const code = String(error.details.error || error.details.code || "").toLowerCase();
        return ["plan_limit_exceeded", "plan_limit_reached", "trial_expired", "feature_not_available"].includes(code);
    };
    const maybeShowUpgradePrompt = (error: unknown) => {
        if (!isPricingUpgradeError(error)) return false;
        setUpgradePromptDetails((error as ApiRequestError).details || {});
        setUpgradePromptOpen(true);
        return true;
    };

    const registryCredentials = () => registry && registryUsername && registryPassword ? { registry, username: registryUsername, password: registryPassword } : undefined;

    // GitHub deploys use Opslin's AI (it writes the Dockerfile and wires infrastructure); uploads and plain Git URLs use the classic buildpack path.
    const usesAi = sourceType === "github";

    const uploadMutation = useMutation({
        mutationFn: async () => {
            if (!files || files.length === 0) throw new Error("No files selected");
            const envVarsObj = envVarsObject();
            setUploadProgress(0.05); setUploadLabel("Creating app");
            const app = await api.createApp(serverId, {
                name: finalName,
                domain: domain || undefined,
                envVars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
                buildpackOverride: buildpackOverride || undefined,
                healthCheckMode: healthCheckMode || undefined,
                healthPath: healthPath.trim() || undefined,
                dockerfileOverride: dockerfileOverride.trim() || undefined,
                registryCredentials: registryCredentials(),
            });
            setUploadProgress(0.1); setUploadLabel("Preparing your files");
            const { archive, archiveSha256, manifest } = await buildArchive(files);
            const uploadId = await uploadArchiveResumable(app.id, archive, archiveSha256, manifest, (progress, label) => {
                setUploadProgress(0.1 + progress * 0.8); setUploadLabel(label);
            });
            setUploadProgress(0.95); setUploadLabel("Starting the build");
            await api.deployApp(serverId, app.id, { uploadId });
            return app;
        },
        onSuccess: (data) => { setUploadProgress(1); setUploadLabel("Deploy started"); router.push(`/apps/${data.id}`); },
        onError: (error) => { void maybeShowUpgradePrompt(error); },
    });

    const gitMutation = useMutation({
        mutationFn: async () => {
            const envVarsObj = envVarsObject();
            setGitPhase("creating");
            const app = await api.createApp(serverId, {
                name: finalName, gitUrl, branch,
                domain: domain || undefined,
                envVars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
                buildpackOverride: buildpackOverride || undefined,
                healthCheckMode: healthCheckMode || undefined,
                healthPath: healthPath.trim() || undefined,
                dockerfileOverride: dockerfileOverride.trim() || undefined,
                registryCredentials: registryCredentials(),
            });
            setGitPhase("starting");
            await api.deployApp(serverId, app.id);
            return app;
        },
        onSuccess: (data) => { router.push(`/apps/${data.id}`); },
        onError: (error) => { void maybeShowUpgradePrompt(error); },
    });

    // AI deploy: dispatched as a job, tracked by polling + a live socket (same as agent updates and firewall applies).
    const [aiJobId, setAiJobId] = useState<string | null>(null);
    const [aiLiveProgress, setAiLiveProgress] = useState<NonNullable<ServerJobStatus["progress"]> | null>(null);

    const aiJobQuery = useQuery({
        queryKey: ["server-job", serverId, aiJobId],
        queryFn: () => api.getServerJobStatus(serverId, aiJobId!),
        enabled: Boolean(serverId) && Boolean(aiJobId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "COMPLETED" || status === "FAILED" ? false : 2500;
        },
    });

    useAiSocket(aiJobId, setAiLiveProgress);

    const triggerAiMutation = useMutation({
        mutationFn: async () => {
            const extraEnvVarsObj = envVarsObject();
            return api.triggerAutoDeploy(serverId, {
                gitUrl,
                branch,
                githubInstallationId: githubInstallationId || undefined,
                appNamePrefix: finalName,
                extraEnvVars: Object.keys(extraEnvVarsObj).length > 0 ? extraEnvVarsObj : undefined,
            });
        },
        onSuccess: (data) => {
            setAiLiveProgress({ phase: "queued", percent: 5, message: null, status: "running" });
            setAiJobId(data.jobId);
        },
        onError: (error) => { void maybeShowUpgradePrompt(error); },
    });

    const trackedAiJob = useMemo(() => {
        const job = aiJobQuery.data;
        if (!job) return null;
        // Polled progress wins once the job reports something newer than the live socket.
        const polled = job.progress || {};
        const live = aiLiveProgress || {};
        const percent = Math.max(Number(polled.percent ?? 0), Number(live.percent ?? 0));
        return { ...job, progress: { ...polled, ...live, percent, message: live.message || polled.message || null } };
    }, [aiJobQuery.data, aiLiveProgress]);

    const aiResult = trackedAiJob?.status === "COMPLETED" ? (trackedAiJob.result as AutoDeployResult | undefined) : undefined;
    const aiFailureMessage = trackedAiJob?.status === "FAILED"
        ? (trackedAiJob.error || "AI-assisted deploy failed.")
        : trackedAiJob?.status === "COMPLETED" && aiResult && !aiResult.primaryAppId
            ? describeAutoDeployFailure(aiResult)
            : null;
    const aiDone = Boolean(aiResult?.primaryAppId);
    const aiIsRunning = triggerAiMutation.isPending || (Boolean(aiJobId) && trackedAiJob?.status !== "COMPLETED" && trackedAiJob?.status !== "FAILED");

    const handleSubmit = () => {
        if (sourceType === "upload") uploadMutation.mutate();
        else if (usesAi) triggerAiMutation.mutate();
        else gitMutation.mutate();
    };

    const isLoading = uploadMutation.isPending || gitMutation.isPending || aiIsRunning || (usesAi && aiDone);
    const error = uploadMutation.error || gitMutation.error || triggerAiMutation.error || (aiFailureMessage ? new Error(aiFailureMessage) : null);
    const showInlineError = error && !isPricingUpgradeError(error);

    const sourceReady = sourceType === "upload" ? Boolean(files?.length) : Boolean(gitUrl.trim());
    const canDeploy = Boolean(serverId && finalName && sourceReady);

    const resetSource = (next: SourceType) => {
        setSourceType(next);
        setGitUrl("");
        setBranch("main");
        setSelectedRepoKey(null);
        setGithubInstallationId(null);
        setFiles(null);
        setNameEdited(false);
        setName("");
    };

    const chooseRepository = (repo: typeof repositories[0]) => {
        setSelectedRepoKey(`${repo.installationId}:${repo.fullName}`);
        setGitUrl(repo.cloneUrl || `${repo.htmlUrl}.git`);
        setBranch(repo.defaultBranch || "main");
        setGithubInstallationId(repo.installationId);
        setNameEdited(false);
        setStep("deploy");
    };

    const takeDroppedFiles = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        setSourceType("upload");
        setGitUrl("");
        setSelectedRepoKey(null);
        setGithubInstallationId(null);
        setNameEdited(false);
        setFiles(list);
        setStep("deploy");
    };

    // ----- the live progress view -------------------------------------------------
    const deploying = step === "deploy" && isLoading;

    let progressView: React.ReactNode = null;
    if (deploying) {
        if (usesAi) {
            const percent = Math.max(5, Math.min(100, Number(trackedAiJob?.progress?.percent ?? 5)));
            const stage = aiDone ? 4 : percent < 15 ? 0 : percent < 45 ? 1 : percent < 85 ? 2 : 3;
            const stateFor = (index: number): TimelineState => (index < stage ? "done" : index === stage ? "active" : "pending");
            const message = trackedAiJob?.progress?.message || null;
            progressView = aiDone ? (
                <div className="space-y-6 text-center" data-testid="deploy-success">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-muted text-success-text">
                        <Check className="size-7" aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{finalName} is live</h1>
                        {aiResult?.primaryUrl ? (
                            <a
                                href={aiResult.primaryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-2 rounded-full border bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary hover:underline"
                            >
                                {aiResult.primaryUrl.replace(/^https?:\/\//, "")}
                                <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Button variant="dark" size="lg" onClick={() => router.push(`/apps/${aiResult!.primaryAppId}`)}>Open app</Button>
                        <Button variant="outline" size="lg" onClick={() => router.push(`/apps/${aiResult!.primaryAppId}?section=domains`)}>Add custom domain</Button>
                    </div>
                </div>
            ) : (
                <DeployingView
                    name={finalName}
                    percent={percent}
                    items={[
                        { label: "Cloning repository", state: stateFor(0), detail: message },
                        { label: "Opslin AI is writing your Dockerfile", state: stateFor(1), detail: message },
                        { label: "Building your app", state: stateFor(2), detail: message },
                        { label: "Going live", state: stateFor(3), detail: message },
                    ]}
                />
            );
        } else if (sourceType === "upload") {
            const done = (n: number) => uploadProgress >= n;
            progressView = (
                <DeployingView
                    name={finalName}
                    percent={uploadProgress * 100}
                    items={[
                        { label: "Creating your app", state: done(0.1) ? "done" : "active", detail: uploadLabel },
                        { label: "Uploading your files", state: done(0.95) ? "done" : done(0.1) ? "active" : "pending", detail: uploadLabel },
                        { label: "Starting the build", state: done(0.95) ? "active" : "pending", detail: uploadLabel },
                    ]}
                />
            );
        } else {
            progressView = (
                <DeployingView
                    name={finalName}
                    percent={gitPhase === "creating" ? 30 : 70}
                    items={[
                        { label: "Creating your app", state: gitPhase === "creating" ? "active" : "done", detail: "Setting up the project" },
                        { label: "Starting the build", state: gitPhase === "starting" ? "active" : "pending", detail: "Handing off to your server" },
                    ]}
                />
            );
        }
    }

    // ----- step 1 -------------------------------------------------------------------
    const importCard = (
        <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="p-5 sm:p-6">
                <Tabs value={sourceType} onValueChange={(value) => resetSource(value as SourceType)} className="gap-5">
                    <TabsList aria-label="Where is your code?" className="grid h-12 w-full grid-cols-3 rounded-xl p-1">
                        <TabsTrigger value="github" data-testid="source-github" className="h-full rounded-lg text-[15px]">
                            <Github aria-hidden="true" /> GitHub
                            <Badge variant="secondary" className="bg-primary/[0.06] text-primary">Recommended</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="upload" data-testid="source-upload" className="h-full rounded-lg text-[15px]">
                            <FileIcon aria-hidden="true" /> Drop files
                        </TabsTrigger>
                        <TabsTrigger value="git" data-testid="source-git" className="h-full rounded-lg text-[15px]">
                            <Link2 aria-hidden="true" /> Git URL
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="github" className="space-y-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input aria-label="Search your repositories" placeholder="Search your repositories" value={repoSearchQuery} onChange={(e) => setRepoSearchQuery(e.target.value)} className="h-11 pl-9" />
                        </div>
                        {filteredRepos.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-8 text-center">
                                <Github className="mx-auto mb-3 size-9 text-muted-foreground" aria-hidden="true" />
                                <p className="text-sm font-medium text-foreground">{repositories.length === 0 ? "No repositories yet" : "No repositories match your search"}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {repositories.length === 0 ? "Connect your GitHub account to see your repositories." : "Try a different name or language."}
                                </p>
                                {repositories.length === 0 ? (
                                    <Button className="mt-4" variant="dark" onClick={() => window.location.assign(api.getGitHubInstallUrl())}>
                                        <Github aria-hidden="true" /> Connect GitHub
                                    </Button>
                                ) : null}
                            </div>
                        ) : (
                            <ul className="max-h-[340px] space-y-2 overflow-y-auto pr-1" aria-label="Repositories">
                                {filteredRepos.map((repo) => {
                                    const key = `${repo.installationId}:${repo.fullName}`;
                                    const language = repo.language || "";
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                data-testid={`repo-${repo.fullName}`}
                                                onClick={() => chooseRepository(repo)}
                                                className={cn(
                                                    "group flex w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring",
                                                    selectedRepoKey === key && "border-primary bg-primary/[0.04]"
                                                )}
                                            >
                                                <FolderGit2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{repo.fullName}</span>
                                                {language ? (
                                                    <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
                                                        <span className={cn("size-2.5 rounded-full", LANGUAGE_DOT[language.toLowerCase()] ?? "bg-muted-foreground")} aria-hidden="true" />
                                                        {language}
                                                    </span>
                                                ) : null}
                                                {repo.updatedAt ? <span className="hidden text-sm text-muted-foreground md:block">Updated {formatRelativeTime(repo.updatedAt)}</span> : null}
                                                <span className="inline-flex h-9 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background">Deploy</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <p className="border-t pt-4 text-center text-sm text-muted-foreground">
                            Not seeing your repo?{" "}
                            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => window.location.assign(api.getGitHubInstallUrl())}>
                                Configure GitHub access
                            </button>
                        </p>
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-4">
                        <button
                            type="button"
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) setFiles(e.dataTransfer.files); }}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn("flex w-full flex-col items-center rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5", dragOver && "border-primary bg-primary/5")}
                        >
                            <CloudUpload className="mb-3 size-10 text-muted-foreground" aria-hidden="true" />
                            <span className="text-[15px] font-medium text-foreground">Drop your project here, or click to browse</span>
                            <span className="mt-1 text-sm text-muted-foreground">A folder or .zip. No Git needed.</span>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            aria-label="Choose project files"
                            className="hidden"
                            onChange={(e) => { if (e.target.files && e.target.files.length > 0) setFiles(e.target.files); }}
                        />
                        {files && files.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-foreground">Selected files ({files.length})</p>
                                {Array.from(files).slice(0, 4).map((file, i) => (
                                    <div key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                                        <FileIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                                        <span className="truncate text-foreground">{file.name}</span>
                                        <span className="shrink-0 text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                ))}
                                {files.length > 4 ? <p className="text-sm text-muted-foreground">and {files.length - 4} more</p> : null}
                                <Button type="button" variant="ghost" size="sm" onClick={() => setFiles(null)}><X aria-hidden="true" /> Clear all</Button>
                            </div>
                        ) : null}
                        <div className="flex justify-end">
                            <Button size="lg" variant="dark" data-testid="continue-button" disabled={!sourceReady} onClick={() => setStep("deploy")}>Continue</Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="git" className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr,200px]">
                            <div>
                                <label htmlFor="git-url" className="mb-1.5 block text-sm font-medium text-foreground">Repository URL</label>
                                <div className="relative">
                                    <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                    <Input id="git-url" data-testid="manual-git-url" value={gitUrl} onChange={(e) => { setGitUrl(e.target.value); setGithubInstallationId(null); setNameEdited(false); }} placeholder="https://github.com/user/app.git" className="h-11 pl-9" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="git-branch" className="mb-1.5 block text-sm font-medium text-foreground">Branch</label>
                                <Input id="git-branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="h-11" />
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">Works with any public HTTPS Git repository.</p>
                        <div className="flex justify-end">
                            <Button size="lg" variant="dark" data-testid="continue-button" disabled={!sourceReady} onClick={() => setStep("deploy")}>Continue</Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );

    const dropStrip = (
        <div
            role="button"
            tabIndex={0}
            onClick={() => stripInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stripInputRef.current?.click(); } }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); takeDroppedFiles(e.dataTransfer.files); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-6 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring", dragOver && "border-primary bg-primary/5")}
        >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CloudUpload className="size-5" aria-hidden="true" /> Or drop a folder or .zip here
            </span>
            <span className="text-xs text-muted-foreground">No Git needed</span>
            <input
                ref={stripInputRef}
                type="file"
                multiple
                aria-label="Drop a folder or zip"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { takeDroppedFiles(e.target.files); e.target.value = ""; }}
            />
        </div>
    );

    // ----- step 2 -------------------------------------------------------------------
    const sourceTitle = sourceType === "upload" ? (files && files.length === 1 ? files[0].name : `${files?.length ?? 0} files`) : repoSlug(gitUrl);
    const detectedChips = usesAi
        ? [selectedRepo?.language, "Dockerfile written by Opslin AI", "Health checks & SSL set up for you"].filter(Boolean) as string[]
        : [buildpackOverride ? `Using ${buildpackOptions.find((o) => o.value === buildpackOverride)?.label ?? buildpackOverride}` : "Stack detected automatically", "Health checks & SSL set up for you"];

    const deployCard = (
        <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-3">
                    {sourceType === "upload" ? <FileIcon className="size-5" aria-hidden="true" /> : <Github className="size-5" aria-hidden="true" />}
                    <span className="min-w-0 truncate text-base font-semibold text-foreground">{sourceTitle}</span>
                    {sourceType !== "upload" ? (
                        <span className="inline-flex items-center rounded-lg bg-muted px-2.5 py-1 text-sm text-foreground">{branch || "main"}</span>
                    ) : null}
                    <button type="button" className="ml-auto text-sm font-medium text-primary hover:underline" onClick={() => setStep("import")}>Change</button>
                </div>

                <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-primary">
                        <Sparkles className="size-4" aria-hidden="true" /> {usesAi ? "Opslin AI will set this up" : "Opslin will set this up"}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {detectedChips.map((chip) => (
                            <li key={chip} className="rounded-lg border bg-card px-3 py-1 text-sm text-foreground">{chip}</li>
                        ))}
                    </ul>
                </div>

                <div>
                    <label htmlFor="app-name" className="mb-1.5 block text-sm font-semibold text-foreground">Project name</label>
                    <Input id="app-name" value={displayName} onChange={(e) => { setNameEdited(true); setName(e.target.value); }} placeholder={generatedName} className="h-11" />
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {usesAi ? "If your repo has several services, each is named from this." : "You'll get a live link as soon as it's ready."}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
                    <span className="text-muted-foreground">Deploying to</span>
                    {connectedServers.length === 0 ? (
                        <span className="text-warning-text">No connected server. <Link href="/servers" className="font-medium underline">Add a server</Link> first.</span>
                    ) : changingServer ? (
                        <Select value={serverId} onValueChange={(value) => { setSelectedServerId(value); setChangingServer(false); }}>
                            <SelectTrigger aria-label="Target Server" className="h-9 w-56"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {connectedServers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.ip})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    ) : (
                        <>
                            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                            <span className="font-medium text-foreground" data-testid="deploy-server">{selectedServerData?.name}</span>
                            {connectedServers.length > 1 ? (
                                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setChangingServer(true)}>Change</button>
                            ) : null}
                        </>
                    )}
                </div>

                <div className="border-t pt-2">
                    <button
                        type="button"
                        aria-expanded={optionalOpen}
                        onClick={() => setOptionalOpen((open) => !open)}
                        className="flex w-full items-center gap-3 rounded-lg py-3 text-left focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Settings2 className="size-5 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-foreground">Optional settings</span>
                            <span className="block text-sm text-muted-foreground">{usesAi ? "Environment variables" : "Environment variables, custom domain, health check"}</span>
                        </span>
                        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", optionalOpen && "rotate-180")} aria-hidden="true" />
                    </button>

                    {optionalOpen ? (
                        <div className="space-y-5 pb-2 pt-2">
                            <EnvVarsEditor envVars={envVars} onChange={setEnvVars} />
                            {!usesAi ? (
                                <>
                                    <div>
                                        <label htmlFor="domain" className="mb-1.5 block text-sm font-medium text-foreground">Custom domain</label>
                                        <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.example.com" className="h-10" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-medium text-foreground">Health check</label>
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                            <Select value={healthCheckMode} onValueChange={(v) => setHealthCheckMode(v as HealthCheckMode)}>
                                                <SelectTrigger data-testid="health-check-mode" aria-label="Health Check Mode" className="h-10"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto">Auto (recommended)</SelectItem>
                                                    <SelectItem value="strict_http">Strict HTTP</SelectItem>
                                                    <SelectItem value="port">Port readiness</SelectItem>
                                                    <SelectItem value="process">Background worker (no port)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Input data-testid="health-check-path" aria-label="Health check path" value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/health" disabled={healthCheckMode === "process"} className="h-10 disabled:opacity-50" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="buildpack-override" className="mb-1.5 block text-sm font-medium text-foreground">Build type</label>
                                        <Select value={buildpackOverride || "auto"} onValueChange={(v) => setBuildpackOverride(v === "auto" ? "" : (v as BuildpackName))}>
                                            <SelectTrigger id="buildpack-override" aria-label="Build type" className="h-10 max-w-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {buildpackOptions.map((o) => <SelectItem key={o.value || "auto"} value={o.value || "auto"}>{o.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label htmlFor="dockerfile-override" className="mb-1.5 block text-sm font-medium text-foreground">Dockerfile <span className="font-normal text-muted-foreground">(optional)</span></label>
                                        <Textarea id="dockerfile-override" value={dockerfileOverride} onChange={(e) => setDockerfileOverride(e.target.value)} placeholder="Paste your own Dockerfile here. Leave empty to let Opslin handle it." className="min-h-[100px] font-mono text-xs" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <label htmlFor="registry-host" className="mb-1.5 block text-sm font-medium text-foreground">Private registry host</label>
                                            <Input id="registry-host" value={registry} onChange={(e) => setRegistry(e.target.value)} placeholder="ghcr.io" className="h-10" />
                                        </div>
                                        <div>
                                            <label htmlFor="registry-user" className="mb-1.5 block text-sm font-medium text-foreground">Registry username</label>
                                            <Input id="registry-user" value={registryUsername} onChange={(e) => setRegistryUsername(e.target.value)} placeholder="octocat" className="h-10" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="registry-token" className="mb-1.5 block text-sm font-medium text-foreground">Registry password / token</label>
                                        <div className="relative max-w-sm">
                                            <Input id="registry-token" type={showPassword ? "text" : "password"} value={registryPassword} onChange={(e) => setRegistryPassword(e.target.value)} placeholder="••••••••••••••••" className="h-10 pr-10" />
                                            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                            </button>
                                        </div>
                                        <p className="mt-1.5 text-sm text-muted-foreground">Only needed if your images are in a private registry.</p>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {showInlineError ? (
                    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm text-danger-text">
                        {(error as Error).message}
                    </div>
                ) : null}

                <div className="space-y-2">
                    <Button size="lg" variant="dark" className="h-12 w-full text-base" data-testid="deploy-button" disabled={!canDeploy || isLoading} onClick={handleSubmit}>
                        {isLoading ? <><Loader2 className="animate-spin" aria-hidden="true" /> Deploying</> : <><Rocket aria-hidden="true" /> Deploy</>}
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">Takes about 1-2 minutes</p>
                </div>
            </CardContent>
        </Card>
    );

    if (!serversLoading && servers.length === 0) return <NoServerFlow kind="app" />;

    return (
        <div className="mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6">
            <div className="space-y-8">
                <Stepper step={deploying ? "deploy" : step} />

                {progressView ?? (
                    <>
                        <div className="space-y-3 text-center">
                            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                                {step === "import" ? "Let's deploy your project" : "Looks good. Ready to go live?"}
                            </h1>
                            <p className="text-lg text-muted-foreground">
                                {step === "import" ? "Pick your code. Opslin's AI sets up everything else, no DevOps needed." : "We'll detect and set up everything automatically."}
                            </p>
                        </div>

                        {step === "import" ? (
                            <>
                                {importCard}
                                {dropStrip}
                            </>
                        ) : (
                            <>
                                {deployCard}
                                <div className="text-center">
                                    <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep("import")}>
                                        <ArrowLeft className="size-4" aria-hidden="true" /> Back
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            <UpgradePrompt open={upgradePromptOpen} onOpenChange={setUpgradePromptOpen} details={upgradePromptDetails} />
        </div>
    );
}

/** Live progress socket for an AI deploy job. Polling stays the fallback, so socket errors are ignored. */
function useAiSocket(jobId: string | null, onProgress: (progress: NonNullable<ServerJobStatus["progress"]>) => void) {
    const handler = useRef(onProgress);
    useEffect(() => {
        handler.current = onProgress;
    });
    useEffect(() => {
        if (!jobId || typeof window === "undefined") return;
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const socket = new WebSocket(`${apiBaseUrl.replace(/^http/, "ws")}/jobs/${jobId}/live`);
        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data) as Record<string, unknown>;
                handler.current({
                    phase: typeof payload.phase === "string" ? payload.phase : null,
                    percent: typeof payload.percent === "number" ? payload.percent : null,
                    message: typeof payload.line === "string" ? payload.line : null,
                    status: typeof payload.status === "string" ? payload.status : null,
                });
            } catch {
                // Keep the polling fallback active.
            }
        };
        return () => socket.close();
    }, [jobId]);
}

export default function NewAppPage() {
    return (
        <Suspense fallback={null}>
            <NewAppPageContent />
        </Suspense>
    );
}
