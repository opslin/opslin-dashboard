import type { Server } from "@/lib/api";

export type OnboardingStep = "server" | "github" | "repo" | "deploy";

export type OnboardingDraft = {
    serverId?: string;
    githubConnected?: boolean;
    gitUrl?: string;
    branch?: string;
};

export const ONBOARDING_STEPS: Array<{ key: OnboardingStep; label: string }> = [
    { key: "server", label: "Server" },
    { key: "github", label: "GitHub" },
    { key: "repo", label: "Repository" },
    { key: "deploy", label: "Deploy" },
];

export function generateAppNameFromGitUrl(value: string) {
    const trimmed = value.trim();
    const lastSegment = trimmed.split("/").filter(Boolean).at(-1) || "app";
    return lastSegment
        .replace(/\.git$/i, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "app";
}

export function connectedServers(servers: Server[]) {
    return servers.filter((server) =>
        server.isLiveConnected ||
        server.status === "connected" ||
        server.status === "pending"
    );
}

export function canAdvanceOnboardingStep(
    step: OnboardingStep,
    draft: OnboardingDraft,
    servers: Server[]
) {
    switch (step) {
        case "server":
            return Boolean(draft.serverId) || connectedServers(servers).length > 0;
        case "github":
            return Boolean(draft.githubConnected || draft.gitUrl);
        case "repo":
            return Boolean(draft.gitUrl && (draft.branch || "main"));
        case "deploy":
            return Boolean(draft.serverId && draft.gitUrl);
    }
}
