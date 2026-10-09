"use client";

import Link from "next/link";
import { Check, GitBranch, Loader2, RotateCcw, SquareArrowOutUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { appAccessUrl, shortSha } from "@/components/apps/app-helpers";
import { deployActor, deployTitle, durationLabel, parseLog, plainReason, progressPhase } from "@/components/apps/deploy-ui";
import { cn, formatRelativeTime } from "@/lib/utils";
import { isFailed, isRunning, statusLabel, type DeploymentItem } from "./lib";

const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "");

type StepState = "done" | "active" | "failed" | "pending";

function steps(item: DeploymentItem): Array<{ label: string; state: StepState; note?: string }> {
    const { deployment } = item;
    const phase = progressPhase(deployment) ?? "";
    const started = { label: "Code received", state: "done" as StepState, note: clock(deployment.startedAt) };
    if (deployment.status === "succeeded" || deployment.status === "rolled_back") {
        return [started, { label: "Built", state: "done" }, { label: "Health check passed", state: "done" }, { label: "Live", state: "done", note: clock(deployment.finishedAt) }];
    }
    if (isRunning(deployment)) {
        const afterBuild = /health|start|deploy|live|swap/.test(phase);
        return [started, { label: "Built", state: afterBuild ? "done" : "active" }, { label: "Health check", state: afterBuild ? "active" : "pending" }, { label: "Live", state: "pending" }];
    }
    const afterBuild = /health|start|deploy|swap/.test(phase);
    return [started, { label: "Built", state: afterBuild ? "done" : "failed" }, { label: "Health check", state: afterBuild ? "failed" : "pending" }, { label: "Live", state: "pending" }];
}

const STEP_STYLE: Record<StepState, string> = {
    done: "bg-success-muted text-success-text",
    active: "bg-primary/10 text-primary",
    failed: "bg-danger-muted text-danger-text",
    pending: "border bg-background text-muted-foreground",
};

export function DeploymentDrawer({ item, open, onOpenChange, rollbackPending, onRollback }: { item: DeploymentItem | null; open: boolean; onOpenChange: (open: boolean) => void; rollbackPending: boolean; onRollback: (item: DeploymentItem) => void }) {
    const deployment = item?.deployment;
    const lines = deployment?.healthLog ? parseLog(deployment.healthLog).slice(-6) : [];
    if (!item || !deployment) return null;
    const { app } = item;
    const status = statusLabel(item);
    const failed = isFailed(deployment);
    const reason = failed ? plainReason(deployment.errorClassification, deployment.healthLog) : null;
    const access = appAccessUrl(app, { ip: app.server.ip ?? "", publicIp: app.server.publicIp ?? null, hostname: app.server.hostname ?? null });
    const duration = durationLabel(deployment);
    const rollbackTarget = item.live ? item.rollbackTo : deployment.status === "succeeded" ? deployment : null;
    const rows: Array<[string, React.ReactNode]> = [
        ["Commit", <span key="c" className="flex min-w-0 items-center gap-2"><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{shortSha(deployment.sha)}</code><span className="truncate">{deployTitle(deployment)}</span></span>],
        ["Branch", <span key="b" className="flex items-center gap-1.5"><GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />{app.branch || "main"}</span>],
        ["Server", app.server.name],
        ["Duration", duration ?? (isRunning(deployment) ? "In progress" : "—")],
    ];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
                <div className="border-b px-6 py-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deployment details</p>
                    <div className="mt-1.5 flex items-center gap-3">
                        <SheetTitle className="text-2xl font-bold tracking-tight">{app.name}</SheetTitle>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", status.tone === "live" || status.tone === "success" ? "bg-success-muted text-success-text" : status.tone === "danger" ? "bg-danger-muted text-danger-text" : status.tone === "info" ? "bg-info-muted text-info-text" : "bg-secondary text-muted-foreground")}>{status.label}</span>
                    </div>
                    <SheetDescription className="mt-1.5">{isRunning(deployment) ? "Started" : failed ? "Failed" : "Deployed"} {formatRelativeTime(deployment.finishedAt ?? deployment.startedAt)} by {deployActor(deployment)}</SheetDescription>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    {reason ? (
                        <section aria-label="What happened" className="rounded-xl border border-danger/30 bg-danger-muted/50 p-4 text-sm">
                            <p className="font-semibold text-danger-text">What happened</p>
                            <p className="mt-1 text-foreground">{reason.description}</p>
                            <p className="mt-1.5 text-muted-foreground">{reason.fix}</p>
                        </section>
                    ) : null}

                    <section aria-label="Deployment progress">
                        <h3 className="text-sm font-bold text-foreground">Deployment progress</h3>
                        <ol className="mt-3">
                            {steps(item).map((step, index, all) => (
                                <li key={step.label} className="relative flex items-center gap-3 pb-4 last:pb-0">
                                    {index < all.length - 1 ? <span className="absolute left-3 top-6 h-full w-px bg-border" aria-hidden="true" /> : null}
                                    <span className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full", STEP_STYLE[step.state])}>
                                        {step.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : step.state === "active" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : step.state === "failed" ? <X className="size-3.5" aria-hidden="true" /> : null}
                                    </span>
                                    <span className={cn("flex-1 text-sm font-medium", step.state === "pending" ? "text-muted-foreground" : "text-foreground")}>{step.label}</span>
                                    {step.note ? <span className="text-xs tabular-nums text-muted-foreground">{step.note}</span> : null}
                                </li>
                            ))}
                        </ol>
                    </section>

                    <section aria-label="Details" className="border-t pt-5">
                        <h3 className="text-sm font-bold text-foreground">Details</h3>
                        <dl className="mt-3 space-y-3 text-sm">
                            {rows.map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 font-medium text-foreground">{value}</dd></div>
                            ))}
                        </dl>
                    </section>

                    <section aria-label="Build logs" className="border-t pt-5">
                        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-foreground">Build logs</h3><span className="text-xs text-muted-foreground">{lines.length ? `Last ${lines.length} lines` : ""}</span></div>
                        {lines.length === 0 ? (
                            <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No logs were saved for this deployment.</p>
                        ) : (
                            <pre className="mt-3 overflow-x-auto rounded-xl bg-inverse p-4 font-mono text-xs leading-relaxed text-text-inverse">
                                {lines.map((line, i) => (
                                    <span key={i} className={cn("block", line.level === "ERROR" && "text-danger", line.level === "WARN" && "text-warning")}>{line.text}</span>
                                ))}
                            </pre>
                        )}
                        <Link href={`/apps/${app.id}?section=logs`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Open full logs →</Link>
                    </section>
                </div>

                <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
                    <Button asChild variant="outline">
                        {access && deployment.status === "succeeded" && item.live ? <a href={access.url} target="_blank" rel="noopener noreferrer"><SquareArrowOutUpRight aria-hidden="true" />Open app</a> : <Link href={`/apps/${app.id}`}><SquareArrowOutUpRight aria-hidden="true" />Open app</Link>}
                    </Button>
                    {rollbackTarget ? (
                        <Button variant="outline" className="text-primary" disabled={rollbackPending} onClick={() => onRollback(item)}><RotateCcw aria-hidden="true" />{item.live ? "Roll back to previous version" : "Roll back to this version"}</Button>
                    ) : null}
                </div>
            </SheetContent>
        </Sheet>
    );
}
