"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type SetupStepId = "server" | "github" | "app";

export type SetupStep = { id: SetupStepId; done: boolean };

/** Pure helper so the rules can be tested without React. */
export function computeSetup(input: { servers: number; githubConnected: boolean; apps: number }) {
    const steps: SetupStep[] = [
        { id: "server", done: input.servers > 0 },
        { id: "github", done: input.servers > 0 && (input.githubConnected || input.apps > 0) },
        { id: "app", done: input.apps > 0 },
    ];
    const done = steps.filter((step) => step.done).length;
    // The step the user should do now: the first one that is not done.
    const current = steps.find((step) => !step.done)?.id ?? null;
    return { steps, done, current, complete: done === steps.length };
}

/**
 * One place that answers "how far along is this workspace?".
 * Every page that needs a server reads from here, so the wording and the look stay the same.
 */
export function useSetupState() {
    const serversQuery = useQuery({ queryKey: ["servers"], queryFn: () => api.getServers() });
    const servers = serversQuery.data ?? [];
    const hasServer = servers.length > 0;

    const appsQuery = useQuery({ queryKey: ["setup", "apps"], queryFn: () => api.getAllApps(), enabled: hasServer });
    // GitHub has no "status" endpoint. If the repository list loads, GitHub is connected.
    const githubQuery = useQuery({ queryKey: ["github", "repos"], queryFn: () => api.getGitHubRepositories(), enabled: hasServer, retry: false });

    const loading = serversQuery.isLoading || (hasServer && (appsQuery.isLoading || githubQuery.isLoading));
    const setup = computeSetup({ servers: servers.length, githubConnected: githubQuery.isSuccess, apps: appsQuery.data?.length ?? 0 });

    return { ...setup, loading, hasServer, noServer: !serversQuery.isLoading && !hasServer, serverName: servers[0]?.name || servers[0]?.hostname || "Your server" };
}
