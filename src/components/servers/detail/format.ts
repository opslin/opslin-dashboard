const GB = 1024 ** 3;

export function formatGb(bytes?: number | null, digits = 1) {
    if (bytes == null || !Number.isFinite(bytes)) return "—";
    const value = bytes / GB;
    return `${value >= 100 ? Math.round(value) : value.toFixed(digits).replace(/\.0$/, "")} GB`;
}

export function formatMb(bytes?: number | null) {
    if (bytes == null || !Number.isFinite(bytes)) return "—";
    const mb = bytes / 1024 ** 2;
    return mb >= 1024 ? formatGb(bytes) : `${Math.round(mb)} MB`;
}

export function formatUptime(seconds?: number | null) {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
    const days = Math.floor(seconds / 86400);
    if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
    const hours = Math.floor(seconds / 3600);
    if (hours >= 1) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    return `${Math.max(1, Math.floor(seconds / 60))} min`;
}

export interface ServerCurrentMetrics {
    cpu?: { percent?: number; cores?: number };
    memory?: { used?: number; total?: number; percent?: number };
    disk?: { used?: number; total?: number; percent?: number };
    uptime?: number;
}
