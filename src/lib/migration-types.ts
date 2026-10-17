/**
 * Server migration types. They mirror opslin-api/src/lib/smi/{planner,view}.ts; keep them in step.
 * The API decides which actions are allowed (`actions`), so the page never re-derives the state machine.
 */

export type MigrationStatus =
    | "DISCOVERING"
    | "PLANNED"
    | "PROVISIONING"
    | "TRANSFERRING"
    | "VERIFYING"
    | "READY_FOR_CUTOVER"
    | "CUTTING_OVER"
    | "OBSERVING"
    | "ACCEPTED"
    | "FAILED"
    | "RECOVERY_REQUIRED"
    | "ABORTED"
    | "ROLLED_BACK"
    | "CUTOVER_DONE";

export type PlanDisposition = "move" | "manual" | "blocked" | "skip";
export type PlanItemKind = "container" | "image" | "network" | "volume" | "bind" | "database" | "site" | "manual";

export interface PlanItem {
    key: string;
    kind: PlanItemKind;
    label: string;
    disposition: PlanDisposition;
    reason?: string;
    bytes?: number;
    method?: string;
    dependsOn: string[];
    severity?: "info" | "warn" | "blocker";
    needsAck: boolean;
    detail?: Record<string, unknown>;
}

export interface PlanCheck {
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
}

export interface Range {
    min: number;
    max: number;
}

export interface MigrationPlan {
    version: 1;
    generatedAt: string;
    factsHash: string;
    items: PlanItem[];
    copyOrder: string[];
    startOrder: string[];
    checks: PlanCheck[];
    domains: Array<{ names: string[]; tls: boolean; sourceFile: string; movable: boolean }>;
    estimate: { prepareSec: Range; writePauseSec: Range; copyBytes: number; assumptions: string[] };
    summary: { move: number; manual: number; blocked: number; skip: number; copyBytes: number };
    needsAck: string[];
    risks: string[];
    ready: boolean;
    notReadyReasons: string[];
}

export type StageId = "look" | "plan" | "practice" | "switch" | "live";
export type StageState = "done" | "current" | "pending" | "failed" | "attention";

export interface MigrationStage {
    id: StageId;
    label: string;
    state: StageState;
}

export interface MigrationStep {
    id: string;
    label: string;
    state: "done" | "current" | "pending";
}

export interface MigrationActions {
    canConfirm: boolean;
    canEditPlan: boolean;
    canCutover: boolean;
    canAccept: boolean;
    canAbort: boolean;
    canRetry: boolean;
    canRescan: boolean;
    canRecover: boolean;
    canResume: boolean;
    canClearCopy: boolean;
    canRetryLinks: boolean;
    canCheckLinks: boolean;
    canRecheck: boolean;
}

export interface MigrationFailure {
    stage?: string;
    message?: string;
    at?: string;
    retryable?: boolean;
    sourceRestored?: boolean;
}

export interface MigrationServerRef {
    id: string;
    name: string;
    ip: string;
    hostname: string | null;
}

export type FindingLevel = "problem" | "warning" | "info" | "ok";

export interface PrecheckFinding {
    id: string;
    level: FindingLevel;
    title: string;
    detail: string;
    fix?: string;
}

/** What was seen when the temporary address of a moved site was opened (opslin-api lib/smi/precheck.ts). */
export interface PrecheckReport {
    checkedAt: string;
    url: string;
    reached: boolean;
    status: number | null;
    findings: PrecheckFinding[];
    summary: { problems: number; warnings: number };
    disclaimer: string;
    notChecked: string[];
}

export type MovedAppState = "pending" | "ready" | "failed" | "skipped" | "removing" | "removed";

/** A moved web site that became an Opslin app with a temporary address (opslin-api lib/smi/adoption.ts). */
export interface MovedApp {
    key: string;
    label: string;
    names: string[];
    container: string | null;
    port: number | null;
    appId: string | null;
    domain: string | null;
    url: string | null;
    https?: { state: "active" | "waiting" | "blocked"; reason: string | null } | null;
    state: MovedAppState;
    note: string | null;
    precheck: PrecheckReport | null;
    updatedAt: string;
}

export interface ServerSummary {
    dockerFound: boolean;
    dockerVersion: string | null;
    apps: number;
    databases: number;
    engines: string[];
    folders: number;
    websites: number;
    bytes: number;
    usesNginx: boolean;
    empty: boolean;
    memoryMb: number | null;
    diskFreeMb: number | null;
    cpus: number | null;
    hostname: string | null;
}

export interface ServiceCheck {
    id: string;
    name: string;
    kind: "payments" | "sms" | "email" | "shipping" | "maps" | "storage" | "login" | "other";
    evidence: string[];
    checks: string[];
}

export interface MigrationView {
    id: string;
    status: MigrationStatus;
    createdAt: string;
    updatedAt: string;
    liveAt: string | null;
    writerOwner: "source" | "none" | "target" | string;
    source: MigrationServerRef;
    target: MigrationServerRef;
    stages: MigrationStage[];
    progress: { phase: string; message: string; percent: number; stepsDone: number; stepsTotal: number; current: string | null };
    steps: MigrationStep[];
    failure: MigrationFailure | null;
    plan: MigrationPlan | null;
    planHash: string | null;
    skip: string[];
    scan: { gaps: string[]; sourceHost: unknown; targetHost: unknown } | null;
    /** What to do before the switch: the new server's public address and the outside services found in the settings. */
    readiness: { newServerIp: string | null; oldServerIp: string | null; services: ServiceCheck[] };
    /** What each server holds. Null for a server that has not been read yet. */
    scanSummary: { source: ServerSummary | null; target: ServerSummary | null };
    events: Array<{ id: string; at: string; kind: "stage" | "info" | "warn" | "error" | "item"; message: string }>;
    transfers: Array<{ itemKey: string; kind: string; phase: string; status: string; bytes: number; bytesHint: number | null }>;
    measured: { bytesPerSec: number; finalCopySec: number } | null;
    verification: { rehearsal: PlanCheck[] | null; final: PlanCheck[] | null };
    actions: MigrationActions;
    /** Moved web sites that became apps with a temporary address. Null until the switch has happened. */
    apps: MovedApp[] | null;
    /** After moving back, or a cancel that could not clean up: is the copy still on the new server? Null otherwise. */
    copy: "kept" | "removing" | "removed" | null;
    /** Real folders on the new server that Opslin filled and will not delete. */
    keptFolders: string[];
    finished: boolean;
}

export interface MigrationListItem {
    id: string;
    status: MigrationStatus;
    createdAt: string;
    updatedAt: string;
    message: string;
    percent: number;
    /** "recover" while moving back and "abort" while cancelling, under the status the migration had before. */
    phase?: string;
    failed: boolean;
    source: { id: string; name: string };
    target: { id: string; name: string };
}

export interface MigrationDomains {
    targetIp: string;
    sourceIp: string;
    domains: Array<{ name: string; state: "new-server" | "current-server" | "elsewhere" | "no-record"; addresses: string[] }>;
}

export interface DiagnosisCause {
    id: string;
    level: "likely" | "possible";
    title: string;
    meaning: string;
    services: string[];
    count: number;
    fix: string[];
    example: string | null;
}

/** What the new server's recent error messages most likely mean (opslin-api lib/smi/diagnose.ts). */
export interface Diagnosis {
    checkedAt: string;
    window: string;
    containers: number;
    errorLines: number;
    causes: DiagnosisCause[];
    reassurance: string;
    disclaimer: string;
}
