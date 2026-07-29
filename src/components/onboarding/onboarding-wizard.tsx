"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Github, Laptop, Loader2, Rocket, Server, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { GitHubRepoPicker } from "@/components/apps/github-repo-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
    canAdvanceOnboardingStep,
    connectedServers,
    generateAppNameFromGitUrl,
    ONBOARDING_STEPS,
    type OnboardingStep,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function installCommand(platform: "linux" | "macos") {
    const path = platform === "linux" ? "/agent/install" : "/agent/install/macos";
    const suffix = platform === "linux" ? " | sudo bash" : " | bash";
    return `curl -fsSL ${apiBaseUrl}${path}${suffix}`;
}

export function OnboardingWizard() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [stepIndex, setStepIndex] = useState(0);
    const [selectedServerId, setSelectedServerId] = useState("");
    const [gitUrl, setGitUrl] = useState("");
    const [branch, setBranch] = useState("main");
    const [githubInstallationId, setGithubInstallationId] = useState<string | null>(null);
    const [appName, setAppName] = useState("");

    const serversQuery = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
        refetchInterval: 10_000,
    });

    const githubQuery = useQuery({
        queryKey: ["github", "repos", "onboarding"],
        queryFn: () => api.getGitHubRepositories(),
        retry: false,
    });

    const servers = serversQuery.data ?? [];
    const liveServers = connectedServers(servers);
    const activeServerId = selectedServerId || liveServers[0]?.id || "";
    const currentStep = ONBOARDING_STEPS[stepIndex]?.key ?? "server";
    const githubConnected = Boolean(githubInstallationId || (githubQuery.data?.repositories?.length ?? 0) > 0);

    const draft = {
        serverId: activeServerId,
        githubConnected,
        gitUrl,
        branch,
    };

    const canContinue = canAdvanceOnboardingStep(currentStep, draft, servers);

    const generatedName = useMemo(() => generateAppNameFromGitUrl(gitUrl), [gitUrl]);
    const finalAppName = appName.trim() || generatedName;

    const deployMutation = useMutation({
        mutationFn: async () => {
            const app = await api.createApp(activeServerId, {
                name: finalAppName,
                gitUrl,
                branch: branch || "main",
                githubInstallationId: githubInstallationId || undefined,
            });
            const deploy = await api.deployApp(activeServerId, app.id);
            await api.updateOnboarding(true);
            return { app, deploy };
        },
        onSuccess: ({ app }) => {
            queryClient.invalidateQueries({ queryKey: ["servers"] });
            queryClient.invalidateQueries({ queryKey: ["apps"] });
            queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
            router.push(`/apps/${app.id}`);
        },
    });

    const nextStep = () => {
        if (!canContinue) {
            return;
        }
        setStepIndex((index) => Math.min(index + 1, ONBOARDING_STEPS.length - 1));
    };

    const previousStep = () => {
        setStepIndex((index) => Math.max(index - 1, 0));
    };

    return (
        <div className="mx-auto max-w-5xl p-6">
            <div className="mb-6">
                <p className="text-sm font-medium text-primary">First deployment setup</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">
                    Connect a server, choose a repository, deploy once
                </h1>
                <p className="mt-2 max-w-3xl text-muted-foreground">
                    Opslin needs one live agent and one source repository before the dashboard has real deployment data.
                </p>
            </div>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border">
                    <div className="grid gap-3 md:grid-cols-4">
                        {ONBOARDING_STEPS.map((step, index) => {
                            const active = index === stepIndex;
                            const completed = index < stepIndex;
                            return (
                                <div
                                    key={step.key}
                                    data-testid={`onboarding-step-${step.key}`}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md border px-3 py-2",
                                        active && "border-primary bg-primary/10",
                                        completed && "border-success/25 bg-success-muted",
                                        !active && !completed && "border-border bg-card"
                                    )}
                                >
                                    {completed ? (
                                        <CheckCircle2 className="h-5 w-5 text-success-text" />
                                    ) : (
                                        <span className={cn(
                                            "flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                                            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                        )}>
                                            {index + 1}
                                        </span>
                                    )}
                                    <span className="text-sm font-medium text-foreground">{step.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardHeader>

                <CardContent className="p-6">
                    {currentStep === "server" && (
                        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Server className="mt-1 h-5 w-5 text-primary" />
                                    <div>
                                        <CardTitle>Connect your first server</CardTitle>
                                        <CardDescription className="mt-1">
                                            Run the command for the machine you want Opslin to manage. The wizard checks for a connected server every 3 seconds.
                                        </CardDescription>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label>Linux VPS</Label>
                                    <code className="block rounded-md border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-sm text-slate-100" tabIndex={0}>
                                        {installCommand("linux")}
                                    </code>
                                    <Label>MacBook local test</Label>
                                    <code className="block rounded-md border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-sm text-slate-100" tabIndex={0}>
                                        {installCommand("macos")}
                                    </code>
                                </div>
                            </div>

                            <div className="rounded-lg border border-border bg-muted p-4">
                                <div className="flex items-center gap-2">
                                    {liveServers.length > 0 ? (
                                        <CheckCircle2 className="h-5 w-5 text-success-text" />
                                    ) : (
                                        <Loader2 className="h-5 w-5 animate-spin text-info-text" />
                                    )}
                                    <p className="font-medium text-foreground">
                                        {liveServers.length > 0 ? "Server detected" : "Waiting for server"}
                                    </p>
                                </div>

                                {liveServers.length > 0 ? (
                                    <div className="mt-4 space-y-2">
                                        <Label htmlFor="onboarding-server">Deployment server</Label>
                                        <select
                                            id="onboarding-server"
                                            data-testid="onboarding-server-select"
                                            value={activeServerId}
                                            onChange={(event) => setSelectedServerId(event.target.value)}
                                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                                        >
                                            {liveServers.map((server) => (
                                                <option key={server.id} value={server.id}>
                                                    {server.name} ({server.ip})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Keep this page open after running the installer. The server appears here when the agent connects and is claimed.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {currentStep === "github" && (
                        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <Github className="h-5 w-5 text-primary" />
                                    <CardTitle>Connect GitHub</CardTitle>
                                </div>
                                <CardDescription>
                                    Install the Opslin GitHub App for one account, then repositories become selectable in the next step.
                                </CardDescription>
                                <Button type="button" onClick={() => window.location.assign(api.getGitHubInstallUrl())}>
                                    <Github className="mr-2 h-4 w-4" />
                                    Connect GitHub
                                </Button>
                                {githubConnected && (
                                    <div className="rounded-md border border-success/25 bg-success-muted px-3 py-2 text-sm text-success-text">
                                        GitHub repositories are available.
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="onboarding-manual-url">Or paste a Git URL</Label>
                                <Input
                                    id="onboarding-manual-url"
                                    data-testid="onboarding-manual-url"
                                    value={gitUrl}
                                    onChange={(event) => {
                                        setGitUrl(event.target.value);
                                        setGithubInstallationId(null);
                                    }}
                                    placeholder="https://github.com/user/app.git"
                                />
                            </div>
                        </div>
                    )}

                    {currentStep === "repo" && (
                        <div className="space-y-5">
                            <div className="flex items-center gap-3">
                                <UploadCloud className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Choose repository and branch</CardTitle>
                                    <CardDescription className="mt-1">
                                        Pick from GitHub or use the manual URL fallback.
                                    </CardDescription>
                                </div>
                            </div>
                            <GitHubRepoPicker
                                gitUrl={gitUrl}
                                branch={branch}
                                githubInstallationId={githubInstallationId}
                                onGitUrlChange={setGitUrl}
                                onBranchChange={setBranch}
                                onGitHubInstallationChange={setGithubInstallationId}
                            />
                        </div>
                    )}

                    {currentStep === "deploy" && (
                        <div className="space-y-5">
                            <div className="flex items-center gap-3">
                                <Rocket className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Ready to deploy</CardTitle>
                                    <CardDescription className="mt-1">
                                        Confirm the generated app name, then Opslin creates the app and starts the first deploy.
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label htmlFor="onboarding-app-name">App name</Label>
                                    <Input
                                        id="onboarding-app-name"
                                        data-testid="onboarding-app-name"
                                        value={appName}
                                        onChange={(event) => setAppName(event.target.value)}
                                        placeholder={generatedName}
                                    />
                                </div>
                                <div>
                                    <Label>Branch</Label>
                                    <Input value={branch || "main"} readOnly />
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
                                <p><span className="font-medium">Server:</span> {liveServers.find((server) => server.id === activeServerId)?.name ?? activeServerId}</p>
                                <p className="mt-1"><span className="font-medium">Repository:</span> {gitUrl}</p>
                            </div>
                        </div>
                    )}

                    {deployMutation.error && (
                        <div className="mt-5 rounded-md border border-danger/25 bg-danger-muted px-3 py-2 text-sm text-danger-text">
                            {(deployMutation.error as Error).message}
                        </div>
                    )}

                    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={previousStep}
                            disabled={stepIndex === 0 || deployMutation.isPending}
                        >
                            Back
                        </Button>
                        {currentStep === "deploy" ? (
                            <Button
                                type="button"
                                data-testid="onboarding-deploy-button"
                                onClick={() => deployMutation.mutate()}
                                disabled={!canContinue || deployMutation.isPending}
                            >
                                {deployMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Starting deploy
                                    </>
                                ) : (
                                    <>
                                        <Rocket className="mr-2 h-4 w-4" />
                                        Deploy now
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                data-testid="onboarding-next"
                                onClick={nextStep}
                                disabled={!canContinue}
                            >
                                Continue
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Laptop className="h-4 w-4" />
                <span>MacBook mode is for local testing. Use the Linux command for a VPS.</span>
            </div>
        </div>
    );
}
