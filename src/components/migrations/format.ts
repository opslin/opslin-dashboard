import type { MigrationPlan, MigrationStatus, MigrationView, PlanItem, Range } from "@/lib/migration-types";

/** Plain-language copy for the migration screens (DESIGN.md C1-C7): sentence case, no tool names or ids. */

export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "unknown size";
    if (n < 1000) return `${Math.round(n)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = n;
    let i = -1;
    do {
        value /= 1000;
        i++;
    } while (value >= 1000 && i < units.length - 1);
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function minutes(sec: number): string {
    if (sec < 45) return "under a minute";
    const m = Math.round(sec / 60);
    if (m < 60) return m <= 1 ? "1 minute" : `${m} minutes`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest === 0 ? `${h} hour${h > 1 ? "s" : ""}` : `${h} h ${rest} min`;
}

/** "about 3 to 8 minutes", never a single number: these are estimates. */
export function formatRange(range: Range): string {
    const lo = Math.max(0, range.min);
    const hi = Math.max(lo, range.max);
    if (hi < 45) return "under a minute";
    const loLabel = Math.round(lo / 60);
    const hiLabel = Math.round(hi / 60);
    if (loLabel === hiLabel) return `about ${minutes(hi)}`;
    if (hi >= 3600 || lo >= 3600) return `about ${minutes(lo)} to ${minutes(hi)}`;
    return `about ${Math.max(loLabel, 1)} to ${hiLabel} minutes`;
}

export const STATUS_LABEL: Record<MigrationStatus, string> = {
    DISCOVERING: "Looking at both servers",
    PLANNED: "Plan ready",
    PROVISIONING: "Preparing the new server",
    TRANSFERRING: "Copying your data",
    VERIFYING: "Checking the practice copy",
    READY_FOR_CUTOVER: "Ready to switch",
    CUTTING_OVER: "Switching over",
    OBSERVING: "Live on the new server",
    ACCEPTED: "Finished",
    FAILED: "Stopped",
    RECOVERY_REQUIRED: "Needs your decision",
    ABORTED: "Cancelled",
    ROLLED_BACK: "Moved back",
    CUTOVER_DONE: "Finished",
};

export type Tone = "neutral" | "working" | "good" | "attention" | "failed";

/** Moving back and cancelling run under the status the migration had before, so the phase decides what to say. */
export function isUnwinding(phase: string | undefined): boolean {
    return phase === "recover" || phase === "abort";
}

export function statusLabel(status: MigrationStatus, phase?: string): string {
    if (phase === "recover" && !FINISHED.has(status)) return "Moving back";
    if (phase === "abort" && !FINISHED.has(status)) return "Cancelling";
    return STATUS_LABEL[status];
}

const FINISHED = new Set<MigrationStatus>(["ACCEPTED", "ABORTED", "ROLLED_BACK", "CUTOVER_DONE"]);

export function statusTone(status: MigrationStatus, phase?: string): Tone {
    if (isUnwinding(phase) && !FINISHED.has(status)) return "working";
    switch (status) {
        case "DISCOVERING":
        case "PROVISIONING":
        case "TRANSFERRING":
        case "VERIFYING":
        case "CUTTING_OVER":
            return "working";
        case "READY_FOR_CUTOVER":
        case "OBSERVING":
        case "ACCEPTED":
        case "CUTOVER_DONE":
            return "good";
        case "RECOVERY_REQUIRED":
            return "attention";
        case "FAILED":
            return "failed";
        default:
            return "neutral";
    }
}

const KIND_NAME: Record<PlanItem["kind"], string> = {
    container: "App",
    image: "Image",
    network: "Network",
    volume: "Files",
    bind: "Folder",
    database: "Database",
    site: "Web address",
    manual: "Other",
};

export function kindName(kind: PlanItem["kind"]): string {
    return KIND_NAME[kind];
}

export interface PlanSummary {
    apps: number;
    databases: number;
    files: number;
    addresses: number;
    bytes: number;
    behind: PlanItem[];
}

/** What the plan does, in the words an owner thinks in. */
export function summarizePlan(plan: MigrationPlan): PlanSummary {
    const moving = plan.items.filter((i) => i.disposition === "move");
    return {
        apps: moving.filter((i) => i.kind === "container").length,
        databases: moving.filter((i) => i.kind === "database").length,
        files: moving.filter((i) => i.kind === "volume" && i.method !== "create-empty").length + moving.filter((i) => i.kind === "bind").length,
        addresses: moving.filter((i) => i.kind === "site").length,
        bytes: plan.summary.copyBytes,
        behind: plan.items.filter((i) => i.needsAck),
    };
}

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** One line: what is moving. */
export function movingLine(s: PlanSummary): string {
    const parts: string[] = [];
    if (s.apps) parts.push(plural(s.apps, "app"));
    if (s.databases) parts.push(plural(s.databases, "database"));
    if (s.files) parts.push(plural(s.files, "folder"));
    if (s.addresses) parts.push(plural(s.addresses, "web address", "web addresses"));
    return parts.length ? parts.join(", ") : "Nothing yet";
}

/** The detail shown to the right of an item row. */
export function itemDetail(item: PlanItem): string {
    const d = (item.detail ?? {}) as Record<string, unknown>;
    switch (item.kind) {
        case "database": {
            const engine = String(d.engine ?? "");
            const name = engine === "postgresql" ? "PostgreSQL" : engine === "mysql" ? "MySQL" : engine === "mariadb" ? "MariaDB" : engine === "mongodb" ? "MongoDB" : engine === "redis" ? "Redis" : "Database";
            const version = d.version ? ` ${String(d.version).split("-")[0]}` : "";
            return `${name}${version}${item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}`;
        }
        case "volume":
        case "bind":
            if (item.method === "covered") return `Inside ${String(d.coveredBy ?? "a folder above")}`;
            return item.method === "create-empty" ? "Filled from the database" : item.bytes ? formatBytes(item.bytes) : "Size unknown";
        case "container":
            return String(d.image ?? "").split("@")[0] || "";
        case "site":
            return item.method === "with-proxy-container" ? "Moves with its proxy" : "Set up on the new server";
        default:
            return "";
    }
}

/** How long the apps are paused, using the measured copy speed once the practice copy has run. */
export function pauseLine(view: Pick<MigrationView, "plan" | "measured">): string | null {
    const plan = view.plan;
    if (!plan) return null;
    if (view.measured) {
        const base = view.measured.finalCopySec;
        // The measured speed covers the copy itself; starting the apps and switching add a little.
        return `${formatRange({ min: base * 0.8 + 30, max: base * 1.6 + 120 })}, from the speed of your practice copy`;
    }
    return `${formatRange(plan.estimate.writePauseSec)}, an estimate`;
}
