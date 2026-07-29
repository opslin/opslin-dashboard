"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, File, Link2, Loader2, Rocket, Search, Settings2, ShieldCheck, X, RefreshCw, Eye, EyeOff,
    Play, Github, GitBranch, CloudUpload, Shield, Server, Info, Lightbulb, Settings, KeyRound, HeartPulse,
} from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnvVarsEditor, EnvVar } from "@/components/ui/env-vars-editor";
import { UpgradePrompt } from "@/components/pricing/upgrade-prompt";
import { Header } from "@/components/layout/header";
import { ServerCapacityCard } from "@/components/deploy/server-capacity-card";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { ApiRequestError, api, type BuildpackName, type HealthCheckMode, type ManifestEntryRecord } from "@/lib/api";
import { generateAppNameFromGitUrl } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { usePlan } from "@/hooks/usePlan";

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

const frameworkChips = [
    { id: "react-vite", label: "React / Vite", icon: "⚛️" },
    { id: "nextjs", label: "Next.js", icon: "▲" },
    { id: "nodejs", label: "Node.js", icon: "🟢" },
    { id: "vue-nuxt", label: "Vue / Nuxt", icon: "💚" },
    { id: "angular", label: "Angular", icon: "🅰️" },
    { id: "sveltekit", label: "SvelteKit", icon: "🧡" },
    { id: "cra", label: "CRA", icon: "⚛️" },
    { id: "custom", label: "Custom", icon: "🔧" },
];

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
// Wizard rail — stage-rail progress indicator (design-system.md §6 grammar,
// standard --motion-base timing; the 400-700ms cinematic budget is reserved
// for the live deploy overlay, not this pre-deploy form).
// ---------------------------------------------------------------------------

type WizardStepId = "source" | "detect" | "env" | "server" | "confirm";

const WIZARD_STEPS: Array<{ id: WizardStepId; label: string; desc: string }> = [
    { id: "source", label: "Source", desc: "Connect your code" },
    { id: "detect", label: "Detect", desc: "Runtime & build" },
    { id: "env", label: "Environment", desc: "Secrets & config" },
    { id: "server", label: "Server", desc: "Choose where it runs" },
    { id: "confirm", label: "Confirm", desc: "Review & launch" },
];

function WizardRail({ stepIndex }: { stepIndex: number }) {
    return (
        <aside
            className="hidden lg:flex lg:w-[220px] lg:shrink-0 flex-col rounded-[var(--opslin-radius-lg)] border border-border bg-card p-5 shadow-[var(--opslin-elevation-2)]"
            aria-label="Deployment steps"
        >
            {WIZARD_STEPS.map((step, i) => {
                const isDone = i < stepIndex;
                const isActive = i === stepIndex;
                return (
                    <div key={step.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <div
                                className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                                    isDone || isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                                )}
                            >
                                {isDone ? <Check className="h-4 w-4" /> : i + 1}
                            </div>
                            {i < WIZARD_STEPS.length - 1 && (
                                <div className={cn("w-px flex-1 min-h-[28px]", isDone ? "bg-primary" : "bg-border")} />
                            )}
                        </div>
                        <div className="pb-7">
                            <div className={cn("text-sm font-medium", isActive || isDone ? "text-foreground" : "text-muted-foreground")}>{step.label}</div>
                            <div className="text-[11px] text-muted-foreground">{step.desc}</div>
                        </div>
                    </div>
                );
            })}
        </aside>
    );
}

function WizardRailMobile({ stepIndex }: { stepIndex: number }) {
    return (
        <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1" aria-label="Deployment steps">
            {WIZARD_STEPS.map((step, i) => {
                const isDone = i < stepIndex;
                const isActive = i === stepIndex;
                return (
                    <div
                        key={step.id}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0",
                            isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success-muted text-success-text" : "bg-secondary text-muted-foreground"
                        )}
                    >
                        {isDone ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                        {step.label}
                    </div>
                );
            })}
        </div>
    );
}

function NewAppPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialServerId = searchParams.get("server");

    const [step, setStep] = useState<WizardStepId>("source");
    const [sourceType, setSourceType] = useState<"github" | "upload" | "git">("github");
    const [name, setName] = useState("");
    const [domain, setDomain] = useState("");
    const [envVars, setEnvVars] = useState<EnvVar[]>([]);
    const [advancedOpen, setAdvancedOpen] = useState(false);
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
    const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
    const [upgradePromptDetails, setUpgradePromptDetails] = useState<Record<string, unknown> | null>(null);
    const { plan } = usePlan();

    const [files, setFiles] = useState<FileList | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [gitUrl, setGitUrl] = useState("");
    const [branch, setBranch] = useState("main");
    const [githubInstallationId, setGithubInstallationId] = useState<string | null>(null);
    const [repoSearchQuery, setRepoSearchQuery] = useState("");
    const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);

    const { data: servers = [] } = useQuery({ queryKey: ["servers"], queryFn: () => api.getServers() });
    const { data: reposData } = useQuery({ queryKey: ["github", "repos"], queryFn: () => api.getGitHubRepositories(), retry: false });
    const repositories = reposData?.repositories || [];

    const [selectedServerId, setSelectedServerId] = useState(initialServerId || "");

    const generatedName = useMemo(() => {
        if (sourceType === "upload" && files?.[0]?.name) return generateAppNameFromGitUrl(files[0].name);
        return generateAppNameFromGitUrl(gitUrl);
    }, [files, gitUrl, sourceType]);

    useEffect(() => { if (!name && generatedName !== "app") setName(generatedName); }, [generatedName, name]);

    const filteredRepos = useMemo(() => {
        const q = repoSearchQuery.trim().toLowerCase();
        if (!q) return repositories;
        return repositories.filter(r => r.fullName.toLowerCase().includes(q) || (r.language || "").toLowerCase().includes(q));
    }, [repositories, repoSearchQuery]);

    const finalName = name.trim() || generatedName;

    const envVarsObject = () => envVars.reduce((acc, v) => { if (v.key) acc[v.key] = v.value; return acc; }, {} as Record<string, string>);

    const maybeShowUpgradePrompt = (error: unknown) => {
        if (!(error instanceof ApiRequestError)) return false;
        const details = error.details || {};
        const code = String(details.error || details.code || "").toLowerCase();
        if (!["plan_limit_exceeded", "plan_limit_reached", "trial_expired", "feature_not_available"].includes(code)) return false;
        setUpgradePromptDetails(details); setUpgradePromptOpen(true); return true;
    };

    const isPricingUpgradeError = (error: unknown) => {
        if (!(error instanceof ApiRequestError)) return false;
        const code = String(error.details.error || error.details.code || "").toLowerCase();
        return ["plan_limit_exceeded", "plan_limit_reached", "trial_expired", "feature_not_available"].includes(code);
    };

    const registryCredentials = () => registry && registryUsername && registryPassword ? { registry, username: registryUsername, password: registryPassword } : undefined;

    const uploadMutation = useMutation({
        mutationFn: async () => {
            if (!files || files.length === 0) throw new Error("No files selected");
            const envVarsObj = envVarsObject();
            setUploadProgress(0.05); setUploadLabel("Creating app");
            const app = await api.createApp(selectedServerId, {
                name: finalName,
                domain: domain || undefined,
                envVars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
                buildpackOverride: buildpackOverride || undefined,
                healthCheckMode: healthCheckMode || undefined,
                healthPath: healthPath.trim() || undefined,
                dockerfileOverride: dockerfileOverride.trim() || undefined,
                registryCredentials: registryCredentials(),
            });
            setUploadProgress(0.1); setUploadLabel("Building archive");
            const { archive, archiveSha256, manifest } = await buildArchive(files);
            const uploadId = await uploadArchiveResumable(app.id, archive, archiveSha256, manifest, (progress, label) => {
                setUploadProgress(0.1 + progress * 0.8); setUploadLabel(label);
            });
            setUploadProgress(0.95); setUploadLabel("Triggering deploy");
            await api.deployApp(selectedServerId, app.id, { uploadId });
            return app;
        },
        onSuccess: (data) => { setUploadProgress(1); setUploadLabel("Deploy started"); router.push(`/apps/${data.id}`); },
        onError: (error) => { void maybeShowUpgradePrompt(error); },
    });

    const gitMutation = useMutation({
        mutationFn: async () => {
            const envVarsObj = envVarsObject();
            const app = await api.createApp(selectedServerId, {
                name: finalName, gitUrl, branch,
                githubInstallationId: sourceType === "github" ? githubInstallationId || undefined : undefined,
                domain: domain || undefined,
                envVars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
                buildpackOverride: buildpackOverride || undefined,
                healthCheckMode: healthCheckMode || undefined,
                healthPath: healthPath.trim() || undefined,
                dockerfileOverride: dockerfileOverride.trim() || undefined,
                registryCredentials: registryCredentials(),
            });
            await api.deployApp(selectedServerId, app.id);
            return app;
        },
        onSuccess: (data) => { router.push(`/apps/${data.id}`); },
        onError: (error) => { void maybeShowUpgradePrompt(error); },
    });

    const handleSubmit = () => {
        if (sourceType === "upload") uploadMutation.mutate();
        else gitMutation.mutate();
    };

    const isLoading = uploadMutation.isPending || gitMutation.isPending;
    const error = uploadMutation.error || gitMutation.error;
    const showInlineError = error && !isPricingUpgradeError(error);

    const sourceReady = sourceType === "upload" ? Boolean(files?.length) : Boolean(gitUrl);
    const canDeploy = Boolean(selectedServerId && finalName && sourceReady);

    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) setFiles(e.dataTransfer.files); };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) setFiles(e.target.files); };

    const selectRepository = (repo: typeof repositories[0]) => {
        setSelectedRepoKey(`${repo.installationId}:${repo.fullName}`);
        setGitUrl(repo.cloneUrl || `${repo.htmlUrl}.git`);
        setBranch(repo.defaultBranch || "main");
        setGithubInstallationId(repo.installationId);
    };

    const selectedServerData = servers.find(s => s.id === selectedServerId);
    const connectedServers = servers.filter(s => s.status === "connected" || s.isLiveConnected);

    const stepIndex = WIZARD_STEPS.findIndex(s => s.id === step);
    const goNext = () => { const next = WIZARD_STEPS[stepIndex + 1]; if (next) setStep(next.id); };
    const goBack = () => { const prev = WIZARD_STEPS[stepIndex - 1]; if (prev) setStep(prev.id); };
    const stepCanContinue = step === "source" ? sourceReady : step === "server" ? Boolean(selectedServerId) : true;

    const selectedBuildpackLabel = buildpackOverride
        ? buildpackOptions.find(o => o.value === buildpackOverride)?.label ?? buildpackOverride
        : "Auto-detect";

    return (
        <div className="dashboard-page">
            <Header
                title="Deploy an application"
                description="Deploy your code to production in a few steps. Fast, secure, and reliable."
                actions={
                    <div className="hidden md:flex items-center gap-3 rounded-[var(--opslin-radius-lg)] border border-border bg-card px-4 py-3">
                        <Play size={28} />
                        <div>
                            <div className="text-sm font-medium text-foreground">New to deployments?</div>
                            <a href="#" className="text-xs text-brand hover:text-brand-hover font-medium">Learn how our deployment process works</a>
                        </div>
                    </div>
                }
            />

            <StaggerGroup className="flex flex-col gap-5">
                <StaggerItem>
                    <WizardRailMobile stepIndex={stepIndex} />
                </StaggerItem>

                <StaggerItem className="flex flex-col lg:flex-row gap-6 items-start">
                    <WizardRail stepIndex={stepIndex} />

                    <div className="flex-1 min-w-0 flex flex-col xl:flex-row gap-5 items-start w-full">
                        <div className="flex-1 min-w-0 space-y-5 w-full">
                            {step === "source" && (
                                <>
                                    <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                        <h2 className="text-lg font-semibold text-foreground mb-1">Choose your source</h2>
                                        <p className="text-sm text-muted-foreground mb-5">Select where your application code is located.</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            {[
                                                { key: "github" as const, title: "GitHub", desc: "Connect your GitHub repository and we'll handle the rest.", icon: Github, recommended: true },
                                                { key: "upload" as const, title: "Upload Files", desc: "Upload your project files directly from your computer.", icon: CloudUpload },
                                                { key: "git" as const, title: "Git URL", desc: "Enter the HTTPS URL of any Git repository.", icon: Link2 },
                                            ].map(option => {
                                                const selected = sourceType === option.key;
                                                return (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        data-testid={`source-${option.key}`}
                                                        onClick={() => setSourceType(option.key)}
                                                        className={cn(
                                                            "relative rounded-[var(--opslin-radius-lg)] border-2 p-5 text-left transition-all",
                                                            selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                                                        )}
                                                    >
                                                        {selected && (
                                                            <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                                                                <Check className="h-3.5 w-3.5 text-primary-foreground" />
                                                            </div>
                                                        )}
                                                        <option.icon size={36} className="mb-3" />
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold text-foreground">{option.title}</h3>
                                                            {option.recommended && (
                                                                <span className="inline-flex items-center rounded-full bg-warning-muted text-warning-text px-2 py-0.5 text-[10px] font-semibold">Recommended</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{option.desc}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {sourceType === "github" && (
                                        <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                            <div className="flex items-center justify-between mb-1">
                                                <div>
                                                    <h2 className="text-lg font-semibold text-foreground">Select a repository</h2>
                                                    <p className="text-sm text-muted-foreground mt-0.5">Choose the repository you want to deploy.</p>
                                                </div>
                                                <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => window.location.assign(api.getGitHubInstallUrl())}>
                                                    <Github size={16} /> Connect GitHub
                                                </Button>
                                            </div>
                                            <div className="flex items-center gap-2 mt-4">
                                                <div className="relative flex-1">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <Input placeholder="Search repositories..." value={repoSearchQuery} onChange={e => setRepoSearchQuery(e.target.value)} className="pl-9 h-10 border-border bg-background" />
                                                </div>
                                                <Button variant="outline" size="icon" className="h-10 w-10"><RefreshCw className="h-4 w-4" /></Button>
                                            </div>
                                            <div className="mt-4 max-h-[440px] overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: "thin" }}>
                                                {filteredRepos.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                                                        <Github size={36} className="mx-auto mb-3" />
                                                        <p className="text-sm font-medium text-foreground">No repositories yet</p>
                                                        <p className="text-xs text-muted-foreground mt-1">Connect your GitHub account to see your repositories</p>
                                                    </div>
                                                ) : filteredRepos.map(repo => {
                                                    const isSelected = selectedRepoKey === `${repo.installationId}:${repo.fullName}`;
                                                    return (
                                                        <button
                                                            key={`${repo.installationId}:${repo.fullName}`}
                                                            type="button"
                                                            onClick={() => selectRepository(repo)}
                                                            className={cn(
                                                                "w-full flex items-center gap-4 rounded-lg border p-3 text-left transition-colors",
                                                                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                                                            )}
                                                        >
                                                            <Github size={28} className="shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-foreground truncate">{repo.fullName}</span>
                                                                    {repo.language && (
                                                                        <span className="inline-flex items-center rounded-full bg-warning-muted text-warning-text px-2 py-0.5 text-[10px] font-semibold shrink-0">{repo.language}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                                                                {repo.updatedAt ? `Updated ${new Date(repo.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground shrink-0 hidden md:flex items-center gap-1">
                                                                <GitBranch size={16} /> {repo.defaultBranch || "main"}
                                                            </span>
                                                            <div className={cn("h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center", isSelected ? "border-primary bg-primary" : "border-border")}>
                                                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repository URL</label>
                                                    <div className="relative">
                                                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input data-testid="manual-git-url" value={gitUrl} onChange={e => { setGitUrl(e.target.value); setGithubInstallationId(null); }} placeholder="https://github.com/owner/repo.git" className="pl-9 h-10 border-border bg-background" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Branch</label>
                                                    <div className="relative">
                                                        <GitBranch size={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                                                        <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" className="pl-9 h-10 border-border bg-background" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {sourceType === "git" && (
                                        <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                            <h2 className="text-lg font-semibold text-foreground mb-1">Git Repository URL</h2>
                                            <p className="text-sm text-muted-foreground mb-4">Enter the HTTPS URL of any public Git repository.</p>
                                            <div className="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repository URL</label>
                                                    <div className="relative">
                                                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input data-testid="manual-git-url" value={gitUrl} onChange={e => { setGitUrl(e.target.value); setGithubInstallationId(null); }} placeholder="https://github.com/user/app.git" className="pl-9 h-10 border-border bg-background" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Branch</label>
                                                    <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" className="h-10 border-border bg-background" />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {sourceType === "upload" && (
                                        <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                            <h2 className="text-lg font-semibold text-foreground mb-1">Upload your project</h2>
                                            <p className="text-sm text-muted-foreground mb-4">Drop your project files or browse to select.</p>
                                            <div
                                                onDrop={handleDrop}
                                                onDragOver={(e) => e.preventDefault()}
                                                onClick={() => fileInputRef.current?.click()}
                                                className="cursor-pointer rounded-[var(--opslin-radius-lg)] border-2 border-dashed border-border p-12 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                                            >
                                                <CloudUpload size={56} className="mx-auto mb-3" />
                                                <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                                                <p className="text-xs text-muted-foreground mt-1">ZIP, tar.gz, or project folder files</p>
                                                <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
                                            </div>
                                            {files && files.length > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    <p className="text-sm font-medium text-foreground">Selected files ({files.length})</p>
                                                    {Array.from(files).slice(0, 6).map((file, i) => (
                                                        <div key={`${file.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <File className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm text-foreground">{file.name}</span>
                                                                <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => setFiles(null)}>
                                                        <X className="h-4 w-4 mr-1" /> Clear all
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {step === "detect" && (
                                <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6 space-y-6">
                                    <div>
                                        <h2 className="text-lg font-semibold text-foreground mb-1">Runtime &amp; build</h2>
                                        <p className="text-sm text-muted-foreground">Opslin detects your stack automatically at build time. Override it here if you need a specific buildpack.</p>
                                    </div>

                                    <div>
                                        <label htmlFor="buildpack-override" className="text-xs font-medium text-muted-foreground mb-1.5 block">Buildpack Override</label>
                                        <Select value={buildpackOverride || "auto"} onValueChange={v => setBuildpackOverride(v === "auto" ? "" : v as BuildpackName)}>
                                            <SelectTrigger id="buildpack-override" aria-label="Buildpack Override" className="h-10 border-border bg-background max-w-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {buildpackOptions.map(o => <SelectItem key={o.value || "auto"} value={o.value || "auto"}>{o.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <span className="inline-flex items-center gap-1 text-[11px] text-success-text font-medium mt-1.5">
                                            <Check className="h-3 w-3" /> {buildpackOverride ? `Using ${selectedBuildpackLabel}` : "Auto-detect will scan your repository at build time"}
                                        </span>
                                        <div className="mt-3">
                                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Supported frameworks</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {frameworkChips.map(chip => (
                                                    <span key={chip.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        <span className="text-[11px]">{chip.icon}</span> {chip.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-border pt-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Shield size={24} />
                                            <h3 className="text-sm font-semibold text-foreground">Secure by default</h3>
                                            <span className="inline-flex items-center rounded-full bg-brand-muted text-brand px-2 py-0.5 text-[10px] font-semibold">{plan?.name || "Business"}</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {[
                                                { label: "Runtime Ports", value: "Private 127.0.0.1", sub: "Not publicly accessible" },
                                                { label: "Public Access", value: "IP preview", sub: "Access restricted" },
                                                { label: "SSL", value: "Auto SSL enabled", sub: "Let's Encrypt" },
                                                { label: "Health Checks", value: "Auto (recommended)", sub: "Auto-restart on failure" },
                                            ].map(item => (
                                                <div key={item.label} className="rounded-lg border border-border p-3">
                                                    <div className="text-[10px] text-muted-foreground mb-1">{item.label}</div>
                                                    <div className="text-xs font-semibold text-foreground">{item.value}</div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 rounded-lg bg-info-muted border border-info/20 px-3 py-2 flex items-center gap-2">
                                            <ShieldCheck className="h-3.5 w-3.5 text-info-text shrink-0" />
                                            <span className="text-[11px] text-foreground/80">No public runtime ports are exposed. Your application is secure by default.</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === "env" && (
                                <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6 space-y-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-foreground mb-1">Environment variables</h2>
                                        <p className="text-sm text-muted-foreground">Add secrets and configuration your app needs at runtime. Optional — you can add these later too.</p>
                                    </div>
                                    <EnvVarsEditor envVars={envVars} onChange={setEnvVars} />
                                </div>
                            )}

                            {step === "server" && (
                                <div className="space-y-5">
                                    <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6 space-y-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-foreground mb-1">Choose a server</h2>
                                            <p className="text-sm text-muted-foreground">Select the VPS where this application will run.</p>
                                        </div>
                                        <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                                            <SelectTrigger aria-label="Target Server" className="h-[58px] border-border bg-background w-full sm:w-auto">
                                                <SelectValue placeholder="Select a server">
                                                    {selectedServerData && (
                                                        <div className="flex items-center gap-3">
                                                            <Server size={20} />
                                                            <div className="text-left">
                                                                <div className="text-sm font-medium text-foreground">{selectedServerData.name}</div>
                                                                <div className="text-[11px] text-muted-foreground">{selectedServerData.ip}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {connectedServers.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        <span className="flex items-center gap-2">
                                                            <span className="h-2 w-2 rounded-full bg-success" />
                                                            {s.name} <span className="text-muted-foreground">({s.ip})</span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {connectedServers.length === 0 && (
                                            <p className="text-xs text-warning-text">No connected servers found. Add a server before deploying.</p>
                                        )}
                                        {selectedServerData && (
                                            <span className="inline-flex items-center gap-1 text-[11px] text-success-text font-medium">
                                                <Check className="h-3 w-3" /> Reachable
                                            </span>
                                        )}
                                    </div>
                                    {selectedServerId && <ServerCapacityCard serverId={selectedServerId} />}
                                </div>
                            )}

                            {step === "confirm" && (
                                <div className="space-y-5">
                                    <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                        <h2 className="text-lg font-semibold text-foreground mb-1">Review &amp; launch</h2>
                                        <p className="text-sm text-muted-foreground mb-4">Confirm the details below, then deploy.</p>
                                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {[
                                                { label: "Source", value: sourceType === "upload" ? `${files?.length ?? 0} file(s) selected` : (gitUrl || "Not set") },
                                                { label: "Branch", value: sourceType === "upload" ? "—" : branch },
                                                { label: "Server", value: selectedServerData ? `${selectedServerData.name} (${selectedServerData.ip})` : "Not selected" },
                                                { label: "Buildpack", value: selectedBuildpackLabel },
                                                { label: "Environment variables", value: envVars.length === 0 ? "None" : `${envVars.length} configured` },
                                                { label: "Domain", value: domain || "Not set (IP access only)" },
                                            ].map(row => (
                                                <div key={row.label} className="rounded-lg border border-border p-3">
                                                    <dt className="text-[10px] text-muted-foreground mb-1">{row.label}</dt>
                                                    <dd className="text-sm font-medium text-foreground truncate">{row.value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>

                                    <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-6">
                                        <label htmlFor="app-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Application name</label>
                                        <Input id="app-name" value={name} onChange={e => setName(e.target.value)} placeholder={generatedName} className="h-10 border-border bg-background max-w-sm" />
                                        <p className="text-[10px] text-muted-foreground mt-1.5">Leave empty to auto-generate from your source.</p>
                                    </div>

                                    <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card overflow-hidden">
                                        <button onClick={() => setAdvancedOpen(!advancedOpen)} className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <Settings2 className="h-4 w-4 text-muted-foreground" />
                                                <h3 className="text-base font-semibold text-foreground">Advanced options</h3>
                                            </div>
                                            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </button>
                                        {advancedOpen && (
                                            <div className="px-5 pb-5 border-t border-border space-y-5">
                                                <p className="text-xs text-muted-foreground pt-3">Customize how your application is served, health-checked, and pulled from a private registry.</p>
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Domain (optional)</label>
                                                    <div className="relative">
                                                        <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.example.com" className="h-10 border-border bg-background pr-24" />
                                                        {domain && (
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-success-text font-medium">
                                                                <Check className="h-3 w-3" /> Available
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Health Check</label>
                                                    <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr] gap-2">
                                                        <Select value={healthCheckMode} onValueChange={v => setHealthCheckMode(v as HealthCheckMode)}>
                                                            <SelectTrigger data-testid="health-check-mode" aria-label="Health Check Mode" className="h-10 border-border bg-background text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto (recommended)</SelectItem>
                                                                <SelectItem value="strict_http">Strict HTTP</SelectItem>
                                                                <SelectItem value="port">Port readiness</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Input data-testid="health-check-path" value={healthPath} onChange={e => setHealthPath(e.target.value)} placeholder="/health" className="h-10 border-border bg-background" />
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1.5">We&apos;ll ping this path to ensure your app is healthy</p>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Dockerfile Override <span className="opacity-60">(optional)</span></label>
                                                    <div className="relative">
                                                        <Textarea value={dockerfileOverride} onChange={e => setDockerfileOverride(e.target.value)} placeholder="Add custom Dockerfile content if you have a custom build process..." className="min-h-[100px] font-mono text-xs border-border bg-background" />
                                                        <span className="absolute right-3 top-3 text-muted-foreground text-xs">{"</>"}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1.5">Leave empty to use auto-detection.</p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Registry Host</label>
                                                        <Input value={registry} onChange={e => setRegistry(e.target.value)} placeholder="ghcr.io" className="h-10 border-border bg-background" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Registry Username <span className="opacity-60">(optional)</span></label>
                                                        <Input value={registryUsername} onChange={e => setRegistryUsername(e.target.value)} placeholder="octocat" className="h-10 border-border bg-background" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Registry Password / Token <span className="opacity-60">(optional)</span></label>
                                                    <div className="relative max-w-sm">
                                                        <Input type={showPassword ? "text" : "password"} value={registryPassword} onChange={e => setRegistryPassword(e.target.value)} placeholder="••••••••••••••••" className="h-10 border-border bg-background pr-10" />
                                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1.5">Stored securely in Opslin. Required if your registry is private.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {uploadLabel && sourceType === "upload" && (
                                        <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-4">
                                            <div className="flex items-center justify-between mb-2 text-sm">
                                                <span className="font-medium text-foreground">{uploadLabel}</span>
                                                <span className="text-muted-foreground">{Math.round(uploadProgress * 100)}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                                            </div>
                                        </div>
                                    )}

                                    {showInlineError && (
                                        <div className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm text-danger-text">
                                            {(error as Error).message}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                                <Button variant="outline" onClick={step === "source" ? () => router.push("/apps") : goBack}>
                                    {step === "source" ? "Cancel" : (<><ArrowLeft className="h-4 w-4" /> Back</>)}
                                </Button>
                                {step === "confirm" ? (
                                    <Button size="lg" data-testid="deploy-button" disabled={!canDeploy || isLoading} onClick={handleSubmit}>
                                        {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Deploying</>) : (<><Rocket className="h-4 w-4" /> Deploy Application</>)}
                                    </Button>
                                ) : (
                                    <Button size="lg" data-testid="continue-button" disabled={!stepCanContinue} onClick={goNext}>
                                        Continue <ArrowRight className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {step !== "source" && (
                            <aside className="w-full xl:w-[280px] xl:shrink-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
                                <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Info size={20} />
                                        <h3 className="text-sm font-semibold text-foreground">Configuration Guide</h3>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mb-4">Understand each section easily.</p>
                                    <div className="space-y-4">
                                        {[
                                            { icon: Settings, title: "Buildpack", desc: "We auto-detect your stack (Node, React, Next.js, etc.)." },
                                            { icon: KeyRound, title: "Env Variables", desc: "Add keys like DATABASE_URL, JWT_SECRET, API_KEY, etc." },
                                            { icon: Server, title: "Server", desc: "Select the server where your app will run." },
                                            { icon: HeartPulse, title: "Health Check", desc: "We'll verify your app's health and auto-restart if needed." },
                                        ].map(item => (
                                            <div key={item.title} className="flex items-start gap-2.5">
                                                <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                                    <item.icon size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold text-foreground">{item.title}</div>
                                                    <div className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-[var(--opslin-radius-lg)] border border-border bg-card p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Play size={20} />
                                        <h3 className="text-sm font-semibold text-foreground">What happens next?</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { num: 1, title: "We build your code", desc: "Opslin clones and builds your repository." },
                                            { num: 2, title: "Deploy to server", desc: "Your application is deployed to the selected server." },
                                            { num: 3, title: "Health verification", desc: "We verify your app is healthy and live." },
                                            { num: 4, title: "You're live!", desc: "Your app is up and running securely." },
                                        ].map(item => (
                                            <div key={item.num} className="flex items-start gap-3">
                                                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-brand-muted text-brand text-xs font-bold shrink-0">{item.num}</span>
                                                <div>
                                                    <div className="text-xs font-semibold text-foreground">{item.title}</div>
                                                    <div className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-[var(--opslin-radius-lg)] border border-warning/30 bg-warning-muted p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Lightbulb size={20} />
                                        <h3 className="text-sm font-semibold text-foreground">Tips</h3>
                                    </div>
                                    <ul className="space-y-2.5 text-[11px] text-foreground/90">
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-warning-text mt-0.5 shrink-0" />
                                            <span><strong>Use Environment Variables</strong> — store secrets and configs securely.</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-warning-text mt-0.5 shrink-0" />
                                            <span><strong>Health Check helps</strong> — auto-restart unhealthy apps.</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-warning-text mt-0.5 shrink-0" />
                                            <span><strong>Leave Domain empty</strong> — if you only need IP access.</span>
                                        </li>
                                    </ul>
                                </div>
                            </aside>
                        )}
                    </div>
                </StaggerItem>
            </StaggerGroup>

            <UpgradePrompt open={upgradePromptOpen} onOpenChange={setUpgradePromptOpen} details={upgradePromptDetails} />
        </div>
    );
}

export default function NewAppPage() {
    return (
        <Suspense fallback={null}>
            <NewAppPageContent />
        </Suspense>
    );
}
