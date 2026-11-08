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
    /** Compose route only, for a production project in a sub-folder: the compose files to run, in order, and the private env files they read. */
    composePaths?: string[];
    privateEnvFiles?: string[];
    /** Compose route, production project: what the project requires from the person, and what Opslin sets up by itself. */
    stackNeeds?: { needsInput: Array<{ name: string; why: string }>; replaceBeforeUse: string[]; willDo: string[] };
  /** Doc 69 F5: the answers the owner gave at the last verified deploy of this project, to start from. */
  savedChoices?: { database?: "create" | "own"; storage?: "skip" | "r2"; migration?: { mode: "auto" } | { mode: "none" } | { mode: "custom"; command: string }; settings?: Record<string, string> };
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
  /** Doc 69 Q2: the database and storage settings the services read, with what each means when Opslin is sure (no values). */
  settings?: Array<{ key: string; resource: "database" | "storage"; role: string | null; sure: boolean }>;
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

/**
 * The compose files the front door chose for a repository whose compose project is not at its top, to send with the new app.
 * Only when the person is following the recommendation for a plain Git deploy: never for the AI way, an official image or a
 * way picked by hand.
 */
export function composePathsToSend(
  data: DeployRecommendationData | null | undefined,
  options: { usesAi: boolean; usesOfficialImage: boolean; overridden: boolean },
): string[] | undefined {
  if (!data || data.route !== "compose" || options.usesAi || options.usesOfficialImage || options.overridden) return undefined;
  return data.composePaths && data.composePaths.length > 0 ? data.composePaths : undefined;
}

/**
 * What the project's own start-up code requires from the person, asked on the review screen before Deploy (for the standard,
 * compose and AI ways). Nothing when the project's own published image is deployed instead.
 */
export function stackNeedsToShow(
  data: DeployRecommendationData | null | undefined,
  options: { usesOfficialImage: boolean },
): DeployRecommendationData["stackNeeds"] {
  if (!data || options.usesOfficialImage) return undefined;
  const needs = data.stackNeeds;
  return needs && (needs.needsInput.length > 0 || needs.willDo.length > 0) ? needs : undefined;
}
