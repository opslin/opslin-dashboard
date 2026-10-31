"use client";

import { ChevronRight, Database, FolderLock, Gauge, Layers, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import type { PlanPreview } from "@/lib/deploy-route-types";

// What an AI-assisted deploy will do, shown before anything is created (doc 64 S1.8): flat rows inside the recommendation
// box (DESIGN.md S1, S2), state only (P1), the reasons behind "Why" (P3). A project Opslin cannot deploy stays visible
// with a lock and the reason instead of failing later (P4, C5: blocked is neutral, not red).

const RESOURCE: Record<string, { label: string; logo?: string }> = {
    postgres: { label: "PostgreSQL", logo: "/brands/postgresql.svg" },
    postgres_vector: { label: "PostgreSQL with pgvector", logo: "/brands/postgresql.svg" },
    mysql: { label: "MySQL", logo: "/brands/mysql.svg" },
    mongodb: { label: "MongoDB", logo: "/brands/mongodb.svg" },
    redis: { label: "Redis", logo: "/brands/redis.svg" },
};
const ROLE: Record<string, string> = { backend: "API", frontend: "website", worker: "background worker", unknown: "web app" };

const resourceName = (kind: string) => RESOURCE[kind]?.label ?? kind;
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A plan Opslin cannot run: Deploy stays disabled and the reason is shown. Questions alone do not block here. */
export function planBlocksDeploy(plan: PlanPreview | null | undefined): boolean {
    return plan?.verdict === "unsupported" || plan?.verdict === "invalid";
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5">
            {icon}
            <span className="min-w-32 flex-1 text-sm font-medium text-foreground">{label}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">{children}</span>
        </div>
    );
}

export function PlanPreviewRows({ plan }: { plan: PlanPreview }) {
    if (planBlocksDeploy(plan)) {
        const reason = plan.questions.find((q) => q.severity === "unsupported" || q.severity === "invalid")?.message ?? "";
        return (
            <div className="border-t px-4 py-3">
                <p className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    Opslin can&apos;t deploy this project yet
                </p>
                {reason ? <p className="mt-1.5 pl-7 text-sm text-muted-foreground [overflow-wrap:anywhere]">{sentence(reason.replace(/^Unsupported:\s*/, "").replace(/\s*Nothing was created\.?/, ""))}</p> : null}
            </div>
        );
    }
    // Opslin creates the databases. Storage is connected by the owner after the deploy (doc 67), so it is listed apart.
    const allKinds = [...new Set(plan.resources.map((r) => r.kind))];
    const kinds = allKinds.filter((kind) => kind !== "object_storage");
    const needsStorage = allKinds.includes("object_storage");
    const k8s = plan.kubernetes && plan.kubernetes.refusals.length === 0 ? plan.kubernetes : null;
    const apps = plan.services.map((s) => ROLE[s.role] ?? "web app");
    const appList = apps.map((a, i) => (i === 0 ? sentence(a) : a)).join(", ");
    return (
        <>
            {k8s ? (
                <Row icon={<Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label={`${plan.services.length} services`}>
                    {k8s.publicService ? `From Kubernetes files · ${k8s.publicService.name} is public` : "From Kubernetes files"}
                </Row>
            ) : plan.services.length > 0 ? (
                <Row icon={<Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label={plan.services.length === 1 ? "1 app" : `${plan.services.length} apps`}>{appList}</Row>
            ) : null}
            {k8s && k8s.memoryMb > 0 ? (
                <Row icon={<Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label="Memory limits">{`${(k8s.memoryMb / 1024).toFixed(1)} GB declared`}</Row>
            ) : null}
            {k8s && k8s.transforms.length > 0 ? (
                <details className="group border-t">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                        <span className="min-w-32 flex-1 text-sm font-medium text-foreground">Changed for one server</span>
                        <span className="text-sm text-muted-foreground">{k8s.transforms.length}</span>
                    </summary>
                    <ul className="space-y-1.5 px-4 pb-3 pl-11 text-sm text-muted-foreground">
                        {k8s.transforms.map((t) => <li key={t} className="[overflow-wrap:anywhere]">{t}</li>)}
                    </ul>
                </details>
            ) : null}
            <Row icon={<Database className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label="Opslin creates">
                    {kinds.length === 0 ? "No databases" : (
                        <>
                            {/* Local brand artwork, decorative next to the name (same convention as DatabaseBrandIcon). */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {kinds.map((kind) => RESOURCE[kind]?.logo ? <img key={kind} src={RESOURCE[kind].logo} alt="" width={16} height={16} className="size-4 dark:rounded-[3px] dark:bg-foreground/90 dark:p-px" /> : null)}
                            <span>{kinds.map(resourceName).join(", ")}</span>
                        </>
                    )}
            </Row>
            {needsStorage ? (
                <Row icon={<FolderLock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label="You connect after deploy">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brands/cloudflare.svg" alt="" width={16} height={16} className="size-4 dark:rounded-[3px] dark:bg-foreground/90 dark:p-px" />
                    <span>Storage (Cloudflare R2 or S3)</span>
                </Row>
            ) : null}
            {plan.skipped.length > 0 ? (
                <details className="group border-t">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                        <span className="min-w-32 flex-1 text-sm font-medium text-foreground">Not created</span>
                        <span className="text-sm text-muted-foreground">{[...new Set(plan.skipped.map((s) => resourceName(s.kind)))].join(", ")}</span>
                    </summary>
                    <ul className="space-y-1.5 px-4 pb-3 pl-11 text-sm text-muted-foreground">
                        {plan.skipped.map((s) => <li key={s.kind + s.reason} className="[overflow-wrap:anywhere]">{sentence(s.reason)}</li>)}
                    </ul>
                </details>
            ) : null}
            {plan.steps.filter((s) => s.kind === "migrate").length > 0 ? (
                <Row icon={<RefreshCw className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label="On every release">
                    <span title={plan.steps.find((s) => s.kind === "migrate")!.command}>Database migration</span>
                </Row>
            ) : null}
            {(plan.persistent ?? []).length > 0 ? (
                <Row icon={<FolderLock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} label="Kept across releases">
                    {[...new Set(plan.persistent!.map((p) => p.path))].join(", ")}
                </Row>
            ) : null}
            {plan.questions.filter((q) => q.severity === "needs_input").map((q) => (
                <div key={q.code + q.message} className="border-t px-4 py-3">
                    <p className="flex items-center gap-3 text-sm font-medium text-warning-text">
                        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                        Needs an answer
                    </p>
                    <p className="mt-1.5 pl-7 text-sm text-muted-foreground [overflow-wrap:anywhere]">{q.message}</p>
                </div>
            ))}
        </>
    );
}
