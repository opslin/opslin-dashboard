import { Box, GitBranch, Clock, Cpu, HardDrive, MemoryStick, Network, Settings, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Fixed example content. Nothing here is real data. These render inside <PreviewFrame>, which labels them.

function Line({ color, height = 40 }: { color: string; height?: number }) {
    return (
        <svg viewBox="0 0 240 40" preserveAspectRatio="none" className="w-full" style={{ height }}>
            <path d="M0 28 C20 14 32 30 52 20 S86 8 108 22 S150 30 172 14 S214 12 240 6 L240 40 L0 40 Z" fill={color} fillOpacity="0.1" />
            <path d="M0 28 C20 14 32 30 52 20 S86 8 108 22 S150 30 172 14 S214 12 240 6" fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

const BLUE = "var(--opslin-info-default)";

export function ExampleApps() {
    const apps = [
        { name: "storefront", stack: "Next.js", icon: Box, stats: [["Requests", "12.4K", "12%"], ["P95 latency", "112 ms", "18%"], ["Error rate", "0.02%", "60%"]] },
        { name: "api", stack: "Node.js", icon: Box, stats: [["Requests", "8.1K", "6%"], ["P95 latency", "84 ms", "22%"], ["Error rate", "0.05%", "71%"]] },
        { name: "worker", stack: "Python", icon: Settings, stats: [["Jobs processed", "4.2K", "20%"], ["Avg duration", "1.8 s", "14%"], ["Error rate", "0.01%", "50%"]] },
    ];
    return (
        <div className="grid gap-5 lg:grid-cols-3">
            {apps.map((app) => (
                <Card key={app.name} className="gap-0 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"><app.icon className="size-5" /></span>
                        <div className="flex-1"><p className="font-bold text-foreground">{app.name}</p><p className="text-sm text-muted-foreground">{app.stack} · main</p></div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2.5 py-1 text-xs font-medium text-success-text"><span className="size-1.5 rounded-full bg-success" />Healthy</span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                        {app.stats.map(([label, value, change]) => (
                            <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold tabular-nums text-foreground">{value}</p><p className="text-xs text-success-text">↑ {change}</p></div>
                        ))}
                    </div>
                    <div className="mt-3"><Line color={BLUE} /></div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1"><GitBranch className="size-3.5" />main</span><span className="flex items-center gap-1"><Clock className="size-3.5" />2 hours ago</span></div>
                </Card>
            ))}
        </div>
    );
}

export function ExampleMonitoring() {
    const cards = [
        { icon: Cpu, label: "CPU", value: "23%", sub: "of 4 cores", color: BLUE },
        { icon: MemoryStick, label: "Memory", value: "1.6 GB", sub: "of 8 GB", color: "var(--opslin-chart-violet)" },
        { icon: HardDrive, label: "Disk", value: "18 GB", sub: "of 100 GB", color: "var(--opslin-warning-default)" },
        { icon: Network, label: "Network", value: "12.4 MB/s", sub: "total", color: "var(--opslin-success-default)" },
    ];
    return (
        <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <Card className="items-center gap-2 rounded-2xl p-5 shadow-xs">
                    <p className="self-start text-sm font-semibold text-foreground">Health score</p>
                    <div className="relative size-32">
                        <svg viewBox="0 0 140 140" className="size-full -rotate-90"><circle cx="70" cy="70" r="56" fill="none" stroke="var(--muted)" strokeWidth="10" /><circle cx="70" cy="70" r="56" fill="none" stroke="var(--opslin-success-default)" strokeWidth="10" strokeLinecap="round" strokeDasharray="338 352" /></svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-bold">96</span><span className="text-xs text-muted-foreground">Excellent</span></div>
                    </div>
                </Card>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map((card) => (
                        <Card key={card.label} className="gap-1 rounded-2xl p-5 shadow-xs">
                            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><card.icon className="size-4 text-muted-foreground" />{card.label}</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{card.value} <span className="text-sm font-normal text-muted-foreground">{card.sub}</span></p>
                            <Line color={card.color} height={48} />
                        </Card>
                    ))}
                </div>
            </div>
            <Card className="gap-2 rounded-2xl p-5 shadow-xs">
                <p className="text-sm font-semibold text-foreground">CPU usage</p>
                <Line color={BLUE} height={160} />
            </Card>
        </div>
    );
}

export function ExampleDeployments() {
    const rows = [
        { app: "api", sha: "d4e5f6a", msg: "Add inventory sync", meta: "Prod VPS 01 · Alex Chen · in progress", state: "run" },
        { app: "storefront", sha: "a1b2c3d", msg: "Fix checkout bug", meta: "Prod VPS 01 · Alex Chen · 1m 12s · 2 hours ago", state: "live" },
        { app: "worker", sha: "3c4d5e6", msg: "Speed up background jobs", meta: "Prod VPS 02 · Sayan Mondal · 54s · 5 hours ago", state: "ok" },
        { app: "docs-site", sha: "7a8b9c0", msg: "Update getting started guide", meta: "Prod VPS 01 · GitHub · 1m 08s · 1 day ago", state: "ok" },
    ];
    return (
        <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
                {[["Running now", "1"], ["Failed this week", "2"], ["Success rate", "94%"]].map(([label, value]) => (
                    <Card key={label} className="gap-1 rounded-2xl p-5 shadow-xs"><p className="text-sm font-semibold text-foreground">{label}</p><p className="text-4xl font-bold tabular-nums">{value}</p></Card>
                ))}
            </div>
            <Card className="gap-0 rounded-2xl px-6 py-2 shadow-xs">
                {rows.map((row) => (
                    <div key={row.sha} className="flex items-center gap-4 border-t py-4 first:border-t-0">
                        <span className={cn("flex size-9 items-center justify-center rounded-full", row.state === "run" ? "bg-info-muted text-info-text" : "bg-success-muted text-success-text")}>{row.state === "run" ? <Loader2 className="size-4" /> : <Check className="size-4" />}</span>
                        <div className="min-w-0 flex-1"><p className="flex items-center gap-3 font-semibold text-foreground">{row.app}<code className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-xs font-normal text-muted-foreground">{row.sha}</code><span className="text-sm font-normal">{row.msg}</span></p><p className="text-xs text-muted-foreground">{row.meta}</p></div>
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", row.state === "run" ? "bg-info-muted text-info-text" : "bg-success-muted text-success-text")}>{row.state === "run" ? "Deploying" : row.state === "live" ? "Live" : "Succeeded"}</span>
                    </div>
                ))}
            </Card>
        </div>
    );
}

export function ExampleTerminal() {
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                <div className="border-b px-4 py-3 text-sm font-medium text-foreground">Shell 1</div>
                <pre className="h-80 overflow-hidden bg-inverse p-4 font-mono text-sm leading-relaxed text-text-inverse">{`deploy@prod-vps-01:~$ docker ps
NAMES        IMAGE               STATUS
storefront   storefront:latest   Up 3 days
api          acme/api:stable     Up 3 days
postgres     postgres:16         Up 3 days

deploy@prod-vps-01:~$ df -h
Filesystem   Size  Used  Avail  Use%
/dev/vda1     80G   18G    62G   23%

deploy@prod-vps-01:~$ `}</pre>
            </div>
            <Card className="gap-3 rounded-2xl p-5 shadow-xs">
                <p className="font-bold text-foreground">Command library</p>
                {[["See how much disk is left", "df -h"], ["Show running apps", "docker ps"], ["Check memory", "free -h"]].map(([title, cmd]) => (
                    <div key={cmd} className="rounded-xl border p-3"><p className="text-sm font-semibold text-foreground">{title}</p><code className="mt-1 inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs">{cmd}</code></div>
                ))}
            </Card>
        </div>
    );
}

