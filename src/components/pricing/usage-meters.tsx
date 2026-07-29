"use client";

import type { PlanUsageResponse } from "@/lib/api";
import { UsageBar } from "@/components/UsageBar";

export function UsageMeters({
    usage,
    limits,
}: PlanUsageResponse) {
    const rows = [
        { key: "servers", label: "Servers", current: usage.servers, limit: limits.servers, upgradeLabel: "servers" },
        { key: "apps", label: "Apps", current: usage.apps, limit: limits.apps, upgradeLabel: "apps" },
        { key: "databases", label: "Databases", current: usage.databases, limit: limits.databases, upgradeLabel: "databases" },
    ] as const;

    return (
        <div data-testid="usage-meters" className="grid gap-4 md:grid-cols-3">
            {rows.map((row) => (
                <div key={row.key} data-testid={`usage-meter-${row.key}`}>
                    <UsageBar
                        label={row.label}
                        used={row.current}
                        limit={row.limit}
                        upgradeLabel={row.upgradeLabel}
                    />
                </div>
            ))}
        </div>
    );
}
