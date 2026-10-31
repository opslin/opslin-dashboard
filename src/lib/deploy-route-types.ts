/** Mirrors opslin-api lib/deploy-plan/front-door.ts RouteRecommendation. */
export type DeployRoute = "simple" | "compose" | "ai";

export interface RouteUnit {
    path: string;
    stack: string;
    framework: string | null;
    runnable: boolean;
    hasDockerfile: boolean;
    needs: string[];
    migration: string | null;
    seedCommand?: string;
}

export interface FitAssessmentData {
    level: "ok" | "tight" | "too_small" | "unknown";
    required: { ramMb: number; diskMb: number };
    available: { ramMb: number; diskMb: number } | null;
    headline: string;
    recommendation: string | null;
    reasons: string[];
    history: { similarTotal: number; similarFailed: number } | null;
}

export interface DeployRecommendationData {
    route: DeployRoute;
    confidence: "high" | "low";
    reasons: string[];
    isMonorepo: boolean;
    units: RouteUnit[];
    needs: string[];
    composeServices: string[];
    safeMigrationAvailable: boolean;
    /** The project's own published image, when its README or compose file names one. */
    officialImage?: { image: string; tag: string; port: number | null } | null;
    resolvedSha: string | null;
    /** What an AI-assisted deploy will create and ask, compiled before anything is created (API doc 64 S1.8). */
    plan?: PlanPreview | null;
}

export interface PlanPreview {
    verdict: "ready" | "needs_input" | "unsupported" | "invalid";
    services: Array<{ id: string; role: string; path: string }>;
    resources: Array<{ id: string; kind: string; usedBy: string[] }>;
    skipped: Array<{ kind: string; reason: string }>;
    steps: Array<{ kind: "migrate" | "demo-seed"; service: string; command: string }>;
    questions: Array<{ code: string; severity: string; message: string }>;
    /** Folders kept on volumes across releases (API doc 64 S2.3). Absent from older API responses. */
    persistent?: Array<{ service: string; path: string }>;
    /** What the repository's Kubernetes files become on one server (API doc 64 S4). Absent for other repositories. */
    kubernetes?: {
        files: string[];
        services: Array<{ name: string; image: string; memoryMb: number | null; oneShot: boolean }>;
        publicService: { name: string; port: number } | null;
        transforms: string[];
        refusals: string[];
        memoryMb: number;
    };
}
