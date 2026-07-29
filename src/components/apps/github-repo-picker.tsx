"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, GitBranch, Github, Link2, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type GitHubRepository } from "@/lib/api";
import { cn } from "@/lib/utils";

type GitHubRepoPickerProps = {
    gitUrl: string;
    branch: string;
    githubInstallationId: string | null;
    onGitUrlChange: (value: string) => void;
    onBranchChange: (value: string) => void;
    onGitHubInstallationChange: (value: string | null) => void;
};

function repoKey(repo: Pick<GitHubRepository, "installationId" | "fullName">) {
    return `${repo.installationId}:${repo.fullName}`;
}

function RepoSkeleton() {
    return (
        <div data-testid="github-repo-picker-skeleton" className="space-y-2">
            {[0, 1, 2].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-md border border-border bg-muted/40" />
            ))}
        </div>
    );
}

export function GitHubRepoPicker({
    gitUrl,
    branch,
    githubInstallationId,
    onGitUrlChange,
    onBranchChange,
    onGitHubInstallationChange,
}: GitHubRepoPickerProps) {
    const [query, setQuery] = useState("");
    const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);

    const reposQuery = useQuery({
        queryKey: ["github", "repos"],
        queryFn: () => api.getGitHubRepositories(),
        retry: false,
    });

    const repositories = reposQuery.data?.repositories ?? [];
    const selectedRepo = useMemo(
        () => repositories.find((repo) => repoKey(repo) === selectedRepoKey) ?? null,
        [repositories, selectedRepoKey]
    );

    const branchesQuery = useQuery({
        queryKey: ["github", "branches", selectedRepo?.owner, selectedRepo?.name, selectedRepo?.installationId],
        queryFn: () => api.getGitHubBranches(
            selectedRepo!.owner,
            selectedRepo!.name,
            selectedRepo!.installationId
        ),
        enabled: Boolean(selectedRepo),
        retry: false,
    });

    const filteredRepositories = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) {
            return repositories;
        }
        return repositories.filter((repo) =>
            repo.fullName.toLowerCase().includes(normalized) ||
            (repo.language ?? "").toLowerCase().includes(normalized)
        );
    }, [repositories, query]);

    const selectRepository = (repo: GitHubRepository) => {
        setSelectedRepoKey(repoKey(repo));
        onGitUrlChange(repo.cloneUrl || `${repo.htmlUrl}.git`);
        onBranchChange(repo.defaultBranch || "main");
        onGitHubInstallationChange(repo.installationId);
    };

    const handleManualGitUrl = (value: string) => {
        setSelectedRepoKey(null);
        onGitUrlChange(value);
        onGitHubInstallationChange(null);
    };

    const connectGitHub = () => {
        window.location.assign(api.getGitHubInstallUrl());
    };

    return (
        <div data-testid="github-repo-picker" className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <Label className="text-sm font-medium text-foreground">GitHub Repository</Label>
                    {selectedRepo && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                            <Check className="h-3.5 w-3.5 text-success-text" />
                            <span>{selectedRepo.fullName}</span>
                        </div>
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={connectGitHub}
                    data-testid="github-connect-button"
                    className="w-full sm:w-auto"
                >
                    <Github className="mr-2 h-4 w-4" />
                    Connect GitHub
                </Button>
            </div>

            <div className="space-y-2">
                <Label htmlFor="repo-search">Repositories</Label>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="repo-search"
                        data-testid="repo-search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search repositories"
                        className="pl-9"
                    />
                </div>
            </div>

            {reposQuery.isLoading && <RepoSkeleton />}

            {reposQuery.isError && (
                <div
                    data-testid="github-repo-picker-error"
                    className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger-muted p-3 text-sm text-danger-text"
                >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{reposQuery.error.message || "GitHub repositories could not be loaded"}</span>
                </div>
            )}

            {!reposQuery.isLoading && !reposQuery.isError && filteredRepositories.length === 0 && (
                <div
                    data-testid="github-repo-picker-empty"
                    className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
                >
                    No repositories found.
                </div>
            )}

            {filteredRepositories.length > 0 && (
                <div
                    data-testid="repo-list"
                    className="max-h-72 overflow-y-auto rounded-md border border-border"
                >
                    {filteredRepositories.map((repo) => {
                        const selected = repoKey(repo) === selectedRepoKey;
                        return (
                            <button
                                key={repoKey(repo)}
                                type="button"
                                data-testid={`repo-item-${repo.fullName.replace(/[^a-zA-Z0-9_-]+/g, "-")}`}
                                onClick={() => selectRepository(repo)}
                                aria-pressed={selected}
                                className={cn(
                                    "flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-3 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/40",
                                    selected && "bg-primary/5"
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        {repo.private ? (
                                            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {repo.fullName}
                                        </span>
                                    </span>
                                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        {repo.language && (
                                            <span className="rounded border border-border px-1.5 py-0.5">
                                                {repo.language}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                            <GitBranch className="h-3 w-3" />
                                            {repo.defaultBranch}
                                        </span>
                                    </span>
                                </span>
                                {selected && <Check className="h-4 w-4 shrink-0 text-info-text" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {selectedRepo && (
                <div className="space-y-2">
                    <Label htmlFor="github-branch">Branch</Label>
                    <select
                        id="github-branch"
                        data-testid="branch-select"
                        value={branch}
                        onChange={(event) => onBranchChange(event.target.value)}
                        disabled={branchesQuery.isLoading}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted/40"
                    >
                        <option value={branch}>{branchesQuery.isLoading ? "Loading branches" : branch}</option>
                        {(branchesQuery.data?.branches ?? [])
                            .filter((item) => item.name !== branch)
                            .map((item) => (
                                <option key={item.name} value={item.name}>
                                    {item.name}
                                </option>
                            ))}
                    </select>
                    {branchesQuery.isError && (
                        <p className="text-xs text-danger-text">{branchesQuery.error.message}</p>
                    )}
                </div>
            )}

            <div className="space-y-3 border-t border-border pt-5">
                <div>
                    <Label htmlFor="gitUrl">Repository URL</Label>
                    <div className="relative mt-2">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="gitUrl"
                            data-testid="manual-git-url"
                            value={gitUrl}
                            onChange={(event) => handleManualGitUrl(event.target.value)}
                            placeholder="https://github.com/user/repo.git"
                            className="pl-9"
                            required
                        />
                    </div>
                </div>
                {!selectedRepo && (
                    <div>
                        <Label htmlFor="manual-branch">Branch</Label>
                        <Input
                            id="manual-branch"
                            data-testid="manual-branch"
                            value={branch}
                            onChange={(event) => onBranchChange(event.target.value)}
                            placeholder="main"
                            className="mt-2"
                        />
                    </div>
                )}
            </div>

            <input type="hidden" value={githubInstallationId ?? ""} readOnly />
        </div>
    );
}
