import type { LucideIcon } from "lucide-react";
import { Clock, Cpu, Database, MemoryStick } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatGb, formatUptime, type ServerCurrentMetrics } from "./format";

function Kpi({ icon: Icon, label, value, hint, percent, tone = "primary" }: { icon: LucideIcon; label: string; value: string; hint: string; percent: number | null; tone?: "primary" | "success" }) {
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-start gap-3 p-4 pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold leading-tight tracking-tight text-foreground">{value}</p>
                    <p className="text-sm text-muted-foreground">{hint}</p>
                </div>
            </div>
            <div className="px-4 pb-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
                    <div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-primary")} style={{ width: `${percent == null ? 0 : Math.min(100, Math.max(2, percent))}%` }} />
                </div>
            </div>
        </Card>
    );
}

export function KpiCards({ metrics, isLive, lastSeen, fallbackUptime }: { metrics?: ServerCurrentMetrics; isLive: boolean; lastSeen: string; fallbackUptime: string }) {
    const cpu = metrics?.cpu?.percent;
    const mem = metrics?.memory;
    const disk = metrics?.disk;
    const memPercent = mem?.percent ?? (mem?.used && mem.total ? (mem.used / mem.total) * 100 : null);
    const diskPercent = disk?.percent ?? (disk?.used && disk.total ? (disk.used / disk.total) * 100 : null);
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Cpu} label="CPU" value={cpu == null ? "—" : `${Math.round(cpu)}%`} hint={metrics?.cpu?.cores ? `${metrics.cpu.cores} vCPU` : "Waiting for data"} percent={cpu ?? null} />
            <Kpi icon={MemoryStick} label="Memory" value={formatGb(mem?.used)} hint={mem?.total ? `of ${formatGb(mem.total, 0)} · ${Math.round(memPercent ?? 0)}%` : "Waiting for data"} percent={memPercent} />
            <Kpi icon={Database} label="Disk" value={formatGb(disk?.used, 0)} hint={disk?.total ? `of ${formatGb(disk.total, 0)} · ${Math.round(diskPercent ?? 0)}%` : "Waiting for data"} percent={diskPercent} />
            <Kpi
                icon={Clock}
                label="Uptime"
                value={metrics?.uptime != null ? formatUptime(metrics.uptime) : fallbackUptime}
                hint={isLive ? "Last seen just now" : `Last seen ${lastSeen}`}
                percent={isLive ? 100 : 0}
                tone="success"
            />
        </div>
    );
}
