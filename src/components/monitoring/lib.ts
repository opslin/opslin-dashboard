import type { AlertEventRecord, AppOverviewMetric, Server } from "@/lib/api";

export type Range = "1h" | "6h" | "24h" | "7d";
export const RANGES: Range[] = ["1h", "6h", "24h", "7d"];
export const RANGE_LABEL: Record<Range, string> = { "1h": "Last hour", "6h": "Last 6 hours", "24h": "Last 24 hours", "7d": "Last 7 days" };

export type ServerMetrics = {
    timestamp: string;
    cpu: { percent: number; cores: number; loadAvg: number[] };
    memory: { used: number; free: number; total: number; cached: number; percent: number };
    disk: { used: number; total: number; percent: number };
    network: { bytesIn: number; bytesOut: number };
    uptime: number;
};

export type HistoricalData = {
    range: string;
    series: {
        timestamps: string[];
        cpu: number[];
        memoryPercent: number[];
        diskPercent: number[];
        netIn: number[];
        netOut: number[];
        loadAvg1m: number[];
    };
    peak: { cpu: number; memory: number; disk: number };
};

export type ChartPoint = { t: number; cpu: number; memory: number; disk: number; netIn: number; netOut: number; load: number };

export function isServerLive(server: Server | undefined) {
    if (!server) return false;
    if (typeof server.isLiveConnected === "boolean") return server.isLiveConnected;
    return server.status === "connected";
}

export function hasServerMetrics(value: unknown): value is ServerMetrics {
    const r = value as Partial<ServerMetrics> | null;
    return Boolean(r && r.cpu && Array.isArray(r.cpu.loadAvg) && r.memory && r.disk && r.network && typeof r.uptime === "number");
}

export function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    const value = bytes / k ** i;
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${sizes[i]}`;
}

export function formatRate(bytes: number): string {
    return `${formatBytes(bytes)}/s`;
}

export type Level = "good" | "watch" | "high";

export function levelFor(percent: number): Level {
    if (percent >= 90) return "high";
    if (percent >= 70) return "watch";
    return "good";
}

export const LEVEL_LABEL: Record<Level, string> = { good: "Good", watch: "Watch", high: "High" };

/** Combine several servers. Percentages show the busiest server so a problem is never averaged away. Network adds up. */
export function aggregateCurrent(list: ServerMetrics[]): ServerMetrics | null {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    const busiest = (pick: (m: ServerMetrics) => number) => list.reduce((best, item) => (pick(item) > pick(best) ? item : best), list[0]);
    const cpu = busiest((m) => m.cpu.percent);
    const memory = busiest((m) => m.memory.percent);
    const disk = busiest((m) => m.disk.percent);
    return {
        timestamp: list.map((m) => m.timestamp).sort().at(-1) ?? list[0].timestamp,
        cpu: cpu.cpu,
        memory: memory.memory,
        disk: disk.disk,
        network: { bytesIn: list.reduce((t, m) => t + m.network.bytesIn, 0), bytesOut: list.reduce((t, m) => t + m.network.bytesOut, 0) },
        uptime: Math.min(...list.map((m) => m.uptime)),
    };
}

/** Turn one or more server histories into one chart series. Servers are grouped by the minute; percentages take the highest value. */
export function buildPoints(histories: HistoricalData[]): ChartPoint[] {
    const buckets = new Map<number, { cpu: number[]; memory: number[]; disk: number[]; netIn: number[]; netOut: number[]; load: number[] }>();
    for (const history of histories) {
        const s = history.series;
        s.timestamps.forEach((stamp, index) => {
            const t = Math.floor(new Date(stamp).getTime() / 60_000) * 60_000;
            if (Number.isNaN(t)) return;
            const bucket = buckets.get(t) ?? { cpu: [], memory: [], disk: [], netIn: [], netOut: [], load: [] };
            bucket.cpu.push(s.cpu[index] ?? 0);
            bucket.memory.push(s.memoryPercent[index] ?? 0);
            bucket.disk.push(s.diskPercent[index] ?? 0);
            bucket.netIn.push(s.netIn[index] ?? 0);
            bucket.netOut.push(s.netOut[index] ?? 0);
            bucket.load.push(s.loadAvg1m[index] ?? 0);
            buckets.set(t, bucket);
        });
    }
    const total = (values: number[]) => values.reduce((a, b) => a + b, 0);
    return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, b]) => ({ t, cpu: Math.max(...b.cpu), memory: Math.max(...b.memory), disk: Math.max(...b.disk), netIn: total(b.netIn), netOut: total(b.netOut), load: Math.max(...b.load) }));
}

/** Days until a percent series reaches 100%, from a straight line through the points. null when it is not growing. */
export function daysUntilFull(points: Array<{ t: number; value: number }>): number | null {
    if (points.length < 10) return null;
    const span = points[points.length - 1].t - points[0].t;
    if (span < 6 * 3_600_000) return null;
    const n = points.length;
    const meanT = points.reduce((a, p) => a + p.t, 0) / n;
    const meanV = points.reduce((a, p) => a + p.value, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of points) {
        num += (p.t - meanT) * (p.value - meanV);
        den += (p.t - meanT) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den; // percent per ms
    if (slope <= 0) return null;
    const last = points[n - 1].value;
    const days = (100 - last) / slope / 86_400_000;
    if (!Number.isFinite(days) || days > 365) return null;
    return Math.max(1, Math.round(days));
}

export type Insight = {
    id: string;
    tone: "danger" | "warning" | "info" | "success";
    title: string;
    /** One short sentence for the summary banner. */
    short: string;
    body: string;
    action?: { label: string; href: string };
    secondary?: { label: string; href?: string; guide?: boolean };
};

type InsightInput = {
    servers: Array<{ server: Server; live: boolean; current: ServerMetrics | null; diskPoints?: Array<{ t: number; value: number }> }>;
    apps: AppOverviewMetric[];
};

const TONE_ORDER: Record<Insight["tone"], number> = { danger: 0, warning: 1, info: 2, success: 3 };

export function buildInsights({ servers, apps }: InsightInput): Insight[] {
    const out: Insight[] = [];
    for (const { server, live, current, diskPoints } of servers) {
        const name = server.name || server.hostname || server.ip;
        if (!live) {
            out.push({ id: `offline-${server.id}`, tone: "danger", title: `${name} is offline`, short: `${name} is offline.`, body: "Opslin can't reach this server, so the numbers below may be out of date.", action: { label: "Open server", href: `/servers/${server.id}` } });
            continue;
        }
        if (!current) continue;
        const disk = current.disk.percent;
        if (disk >= 70) {
            const days = diskPoints ? daysUntilFull(diskPoints) : null;
            out.push({
                id: `disk-${server.id}`,
                tone: disk >= 90 ? "danger" : "warning",
                title: days && disk >= 70 ? `Disk will be full in about ${days} ${days === 1 ? "day" : "days"}` : `Disk usage is ${disk >= 90 ? "very " : ""}high on ${name}`,
                short: `${name} disk is ${disk >= 90 ? "almost full" : "filling up"}.`,
                body: `${name} is at ${Math.round(disk)}%. Apps may stop when storage runs out.`,
                action: { label: disk >= 90 ? "Free up space" : "Clean up disk", href: `/servers/${server.id}` },
                secondary: { label: "Why?", guide: true },
            });
        }
        const mem = current.memory.percent;
        if (mem >= 80) {
            out.push({ id: `mem-${server.id}`, tone: mem >= 90 ? "danger" : "warning", title: `Memory is high on ${name}`, short: `${name} memory is high.`, body: `${Math.round(mem)}% of memory is in use. Apps may restart if it runs out.`, action: { label: "View apps", href: "/apps" } });
        }
        const cpu = current.cpu.percent;
        if (cpu >= 80) {
            out.push({ id: `cpu-${server.id}`, tone: cpu >= 90 ? "danger" : "warning", title: `CPU is busy on ${name}`, short: `${name} CPU is busy.`, body: `The processor is ${Math.round(cpu)}% used. Apps may feel slow.`, action: { label: "View apps", href: "/apps" } });
        }
    }
    for (const app of apps) {
        if (app.healthStatus === "unhealthy") {
            out.push({ id: `unhealthy-${app.id}`, tone: "danger", title: `${app.name} is not healthy`, short: `${app.name} is not healthy.`, body: `Its health check is failing on ${app.server.name}.`, action: { label: "View app", href: `/apps/${app.id}` } });
        } else if (app.restartCount >= 3) {
            out.push({ id: `restarts-${app.id}`, tone: "info", title: `${app.name} restart detected`, short: `The ${app.name} app restarted ${app.restartCount} times.`, body: `${app.name} restarted ${app.restartCount} times.`, action: { label: "View app", href: `/apps/${app.id}` } });
        }
    }
    out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
    if (out.length === 0) {
        out.push({ id: "all-good", tone: "success", title: "No problems found", short: "No problems found.", body: "All servers and apps are inside their normal limits." });
    }
    return out;
}

const SEVERITY_PENALTY = { CRIT: 8, WARN: 4, INFO: 1 } as const;

export type Severity = keyof typeof SEVERITY_PENALTY;

/** Accepts CRIT / critical / WARN / warning and anything else as INFO. */
export function normalizeSeverity(value: unknown): Severity {
    const text = String(value ?? "").toUpperCase();
    if (text.startsWith("CRIT") || text === "HIGH") return "CRIT";
    if (text.startsWith("WARN")) return "WARN";
    return "INFO";
}

export function healthScore(input: {
    servers: Array<{ live: boolean; current: ServerMetrics | null }>;
    apps: AppOverviewMetric[];
    alerts: Pick<AlertEventRecord, "rule">[];
}): number | null {
    if (input.servers.length === 0) return null;
    if (!input.servers.some((s) => s.live && s.current)) return 0;
    let score = 100;
    for (const server of input.servers) {
        if (!server.live) {
            score -= 20;
            continue;
        }
        if (!server.current) continue;
        const worst = Math.max(server.current.cpu.percent, server.current.memory.percent, server.current.disk.percent);
        score -= worst >= 90 ? 15 : worst >= 70 ? 7 : worst >= 50 ? 2 : 0;
    }
    for (const app of input.apps) {
        if (app.healthStatus === "unhealthy") score -= 6;
        else if (app.restartCount >= 3) score -= 3;
    }
    for (const alert of input.alerts) {
        score -= SEVERITY_PENALTY[normalizeSeverity(alert.rule?.severity)];
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

export function timeAgo(iso: string, now = Date.now()): string {
    const diff = Math.max(0, now - new Date(iso).getTime());
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/** How many separate times a series went above a threshold. */
export function countCrossings(values: number[], threshold: number): number {
    let count = 0;
    let above = false;
    for (const value of values) {
        if (value > threshold && !above) count += 1;
        above = value > threshold;
    }
    return count;
}

export function peakAt(points: ChartPoint[], pick: (p: ChartPoint) => number): { value: number; t: number } | null {
    let best: { value: number; t: number } | null = null;
    for (const point of points) {
        const value = pick(point);
        if (!best || value > best.value) best = { value, t: point.t };
    }
    return best;
}
