import { describe, expect, it } from "vitest";
import type { AppOverviewMetric, Server } from "@/lib/api";
import { aggregateCurrent, buildInsights, buildPoints, daysUntilFull, healthScore, levelFor, normalizeSeverity, type ServerMetrics } from "../lib";

const GB = 1024 ** 3;
const metrics = (cpu: number, mem: number, disk: number): ServerMetrics => ({
    timestamp: "2026-10-08T10:00:00.000Z",
    cpu: { percent: cpu, cores: 4, loadAvg: [1, 1, 1] },
    memory: { used: (mem / 100) * 4 * GB, free: GB, total: 4 * GB, cached: 0, percent: mem },
    disk: { used: (disk / 100) * 80 * GB, total: 80 * GB, percent: disk },
    network: { bytesIn: 100, bytesOut: 50 },
    uptime: 1000,
});
const server = (id: string, name: string) => ({ id, name, ip: "1.1.1.1" }) as Server;
const app = (over: Partial<AppOverviewMetric> = {}) => ({ id: "a1", name: "api", status: "running", healthStatus: "healthy", server: { id: "s1", name: "one" }, cpuPercent: 1, memoryUsed: 1, memoryLimit: 2, memoryPercent: 1, restartCount: 0, updatedAt: "", ...over }) as AppOverviewMetric;

describe("monitoring helpers", () => {
    it("maps percent to a level", () => {
        expect(levelFor(40)).toBe("good");
        expect(levelFor(70)).toBe("watch");
        expect(levelFor(95)).toBe("high");
    });

    it("accepts different severity spellings", () => {
        expect(normalizeSeverity("CRIT")).toBe("CRIT");
        expect(normalizeSeverity("critical")).toBe("CRIT");
        expect(normalizeSeverity("warning")).toBe("WARN");
        expect(normalizeSeverity(undefined)).toBe("INFO");
    });

    it("shows the busiest server and adds up network across servers", () => {
        const total = aggregateCurrent([metrics(20, 40, 50), metrics(40, 60, 50)]);
        expect(total?.cpu.percent).toBe(40);
        expect(total?.cpu.cores).toBe(4);
        expect(total?.memory.percent).toBe(60);
        expect(total?.network.bytesIn).toBe(200);
        expect(aggregateCurrent([])).toBeNull();
    });

    it("estimates days until the disk is full", () => {
        const day = 86_400_000;
        const points = Array.from({ length: 24 }, (_, i) => ({ t: i * 3_600_000, value: 50 + (i / 24) * 5 }));
        const days = daysUntilFull(points);
        expect(days).not.toBeNull();
        expect(days!).toBeGreaterThan(5);
        expect(days!).toBeLessThan(15);
        expect(daysUntilFull(points.map((p) => ({ ...p, value: 50 })))).toBeNull();
        expect(daysUntilFull(points.slice(0, 5))).toBeNull();
        expect(day).toBeGreaterThan(0);
    });

    it("combines histories by the minute", () => {
        const h = (value: number) => ({ range: "1h", series: { timestamps: ["2026-10-08T10:00:10.000Z"], cpu: [value], memoryPercent: [10], diskPercent: [20], netIn: [5], netOut: [1], loadAvg1m: [1] }, peak: { cpu: value, memory: 10, disk: 20 } });
        const points = buildPoints([h(20), h(40)]);
        expect(points).toHaveLength(1);
        expect(points[0].cpu).toBe(40);
        expect(points[0].netIn).toBe(10);
    });

    it("writes plain-language insights", () => {
        const insights = buildInsights({
            servers: [
                { server: server("s1", "prod"), live: true, current: metrics(10, 20, 91) },
                { server: server("s2", "old"), live: false, current: null },
            ],
            apps: [app({ restartCount: 4 }), app({ id: "a2", name: "web", healthStatus: "unhealthy" })],
        });
        expect(insights[0].tone).toBe("danger");
        expect(insights.map((i) => i.title)).toEqual(expect.arrayContaining(["Disk usage is very high on prod", "old is offline", "web is not healthy", "api restart detected"]));
        expect(buildInsights({ servers: [{ server: server("s1", "prod"), live: true, current: metrics(10, 20, 30) }], apps: [] })[0].tone).toBe("success");
    });

    it("scores health from servers, apps and alerts", () => {
        const healthy = healthScore({ servers: [{ live: true, current: metrics(10, 20, 30) }], apps: [app()], alerts: [] });
        expect(healthy).toBe(100);
        const worse = healthScore({ servers: [{ live: true, current: metrics(10, 20, 95) }], apps: [app({ healthStatus: "unhealthy" })], alerts: [{ rule: { severity: "critical" } } as never] });
        expect(worse).toBe(100 - 15 - 6 - 8);
        expect(healthScore({ servers: [{ live: false, current: null }], apps: [], alerts: [] })).toBe(0);
        expect(healthScore({ servers: [], apps: [], alerts: [] })).toBeNull();
    });
});
