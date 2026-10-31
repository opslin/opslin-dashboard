"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type AutoDeployResult, type DeploymentCapability } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { SkeletonTile } from "@/components/patterns/skeleton";
const labels: Record<DeploymentCapability["state"], string> = { configured: "Configured", scheduled: "Scheduled", needs_setup: "Setup needed", failed: "Not verified", not_checked: "Not checked" };
export function CapabilityList({ capabilities }: { capabilities: DeploymentCapability[] }) {
    if (!capabilities.length) return null;
    return <section className="space-y-2" aria-label="Storage and backup readiness">
        <p className="text-sm font-medium">Storage and backup readiness</p>
        {capabilities.map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{item.kind === "storage" ? "Application storage" : "Database backups"}</span>
                <StatusBadge status={item.state} label={labels[item.state]} tone={item.state === "configured" ? "success" : item.state === "scheduled" ? "info" : "warning"} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.message}</p>
            <Link href={item.actionHref} className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">{item.kind === "storage" ? "Storage settings" : "Backup settings"}</Link>
        </div>)}
    </section>;
}
export function AppDeploymentCapabilities({ serverId, jobId, appId }: { serverId: string; jobId: string; appId: string }) {
    const query = useQuery({ queryKey: ["server-job-status", serverId, jobId], queryFn: () => api.getServerJobStatus(serverId, jobId), refetchInterval: q => q.state.data?.status === "RUNNING" ? 3000 : false });
    if (query.isLoading) return <SkeletonTile className="h-20 w-full" />;
    if (query.isError) return <p className="text-sm text-muted-foreground">Storage and backup readiness could not be loaded.</p>;
    const result = query.data?.result as AutoDeployResult | undefined;
    const unit = result?.units?.find(u => "appId" in u.outcome && u.outcome.appId === appId);
    return <CapabilityList capabilities={unit?.outcome.stage === "done" ? unit.outcome.capabilities ?? [] : []} />;
}
