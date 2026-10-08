"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Download, FileText, Loader2, RefreshCw, RotateCcw, Search, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { App, DeployErrorClassification, DeploymentRecord } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { shortSha } from "./app-helpers";

// ── helpers ─────────────────────────────────────────────────────────────

export function progressRecord(deployment?: DeploymentRecord | null) {
    const progress = deployment?.queue?.progress;
    return progress && typeof progress === "object" ? progress : null;
}

export function progressPhase(deployment?: DeploymentRecord | null) {
    const progress = progressRecord(deployment);
    const raw = progress?.stage ?? progress?.phase;
    return typeof raw === "string" ? raw.toLowerCase() : null;
}

export function progressPercent(deployment?: DeploymentRecord | null) {
    const progress = progressRecord(deployment);
    const raw = progress?.percentage ?? progress?.percent;
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.min(100, Math.max(0, Math.round(raw)));
    return null;
}

export function lastLogLine(raw?: string | null) {
    if (!raw) return null;
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^#\d+\s/.test(line));
    const latest = lines.at(-1);
    if (!latest) return null;
    return latest.length > 200 ? `${latest.slice(0, 197)}...` : latest;
}

export function progressLine(deployment?: DeploymentRecord | null) {
    const progress = progressRecord(deployment);
    const raw = progress?.description ?? progress?.line;
    if (typeof raw === "string" && raw.trim()) return lastLogLine(raw);
    return lastLogLine(deployment?.healthLog);
}

export function durationLabel(deployment: Pick<DeploymentRecord, "startedAt" | "finishedAt">) {
    if (!deployment.finishedAt) return null;
    const ms = new Date(deployment.finishedAt).getTime() - new Date(deployment.startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${String(s).padStart(2, "0")}s`;
}

function metaString(deployment: DeploymentRecord | null | undefined, ...keys: string[]) {
    for (const key of keys) {
        const value = deployment?.triggerMeta?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

export function deployTitle(deployment: DeploymentRecord) {
    return metaString(deployment, "commitMessage", "message", "commit_message", "title") ?? `Deploy ${shortSha(deployment.sha)}`;
}

export function deployActor(deployment: DeploymentRecord) {
    const named = metaString(deployment, "actorName", "author", "pusher", "triggeredByName");
    if (named) return named;
    switch (deployment.triggeredBy) {
        case "webhook":
        case "github_webhook":
        case "safe_deploy_gate":
            return "GitHub push";
        case "rollback":
            return "Rollback";
        case "manual":
            return "Manual deploy";
        default:
            return deployment.triggeredBy || "System";
    }
}

const STEPS = ["Getting your code", "Building", "Starting the app", "Going live"] as const;

function stepIndex(deployment?: DeploymentRecord | null) {
    const phase = progressPhase(deployment);
    if (!phase) return deployment?.status === "pending" ? 0 : 1;
    if (["queued", "dispatching", "clone", "cloning", "pending"].includes(phase)) return 0;
    if (["detect", "detecting", "build", "building", "running"].includes(phase)) return 1;
    if (["deploy", "deploying", "health", "healthcheck"].includes(phase)) return 2;
    if (["ssl", "complete", "completed"].includes(phase)) return 3;
    return 1;
}

// ── deploying ───────────────────────────────────────────────────────────

export function DeployingCard({ deployment, onViewLogs }: { deployment?: DeploymentRecord | null; onViewLogs: () => void }) {
    const index = stepIndex(deployment);
    const percent = progressPercent(deployment) ?? Math.round(((index + 0.5) / STEPS.length) * 100);
    const line = progressLine(deployment);
    return (
        <section aria-live="polite" className="rounded-2xl border bg-card p-6 shadow-xs">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Deploying your app</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">We&apos;re setting things up for you.</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-info-muted px-3 py-1 text-xs font-medium text-info-text">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Building
                </span>
            </div>
            <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-primary">{percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Deploy progress">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, percent)}%` }} />
                </div>
            </div>
            <ol className="mt-6 space-y-0">
                {STEPS.map((label, i) => {
                    const done = i < index;
                    const active = i === index;
                    return (
                        <li key={label} className="relative flex gap-4 pb-5 last:pb-0" aria-current={active ? "step" : undefined}>
                            {i < STEPS.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-border" aria-hidden="true" /> : null}
                            <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", done ? "bg-success-muted text-success-text" : active ? "bg-info-muted text-info-text" : "bg-muted text-muted-foreground")}>
                                {done ? <Check className="size-4" aria-hidden="true" /> : active ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />}
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className={cn("font-medium", done || active ? "text-foreground" : "text-muted-foreground")}>{label}</p>
                                {active && line ? <p className="mt-2 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{line}</p> : null}
                            </div>
                        </li>
                    );
                })}
            </ol>
            <div className="mt-5 border-t pt-4">
                <button type="button" onClick={onViewLogs} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <FileText className="size-4" aria-hidden="true" /> Show full logs
                </button>
            </div>
        </section>
    );
}

// ── failed ──────────────────────────────────────────────────────────────

function plainReason(classification?: DeployErrorClassification | null, raw?: string | null) {
    const title = classification?.title?.trim();
    const description = (classification?.description || classification?.summary || "").trim();
    const fix = (classification?.suggestedFix || classification?.suggestion || "").trim();
    return {
        title: title || "Build failed",
        description: description || lastLogLine(raw) || "Something went wrong while building your app.",
        fix: fix || "Open the logs, fix the first error, and deploy again.",
    };
}

export function DeployFailedCard({
    app,
    classification,
    rawError,
    liveRelease,
    rollbackTarget,
    rollbackPending,
    deployPending,
    onViewLogs,
    onRollback,
    onRedeploy,
    onApplyEnvFix,
    quickFixPending,
}: {
    app: App;
    classification?: DeployErrorClassification | null;
    rawError?: string | null;
    liveRelease?: DeploymentRecord | null;
    rollbackTarget?: DeploymentRecord | null;
    rollbackPending?: boolean;
    deployPending?: boolean;
    onViewLogs: () => void;
    onRollback: (sha: string) => void;
    onRedeploy: () => void;
    onApplyEnvFix?: (patch: Record<string, string | null>) => void;
    quickFixPending?: boolean;
}) {
    const reason = plainReason(classification, rawError);
    const code = classification?.code || classification?.category || "";
    const strictTypecheck = code === "NEXT_TYPECHECK_FAILED" && onApplyEnvFix;
    const envRelated = /env|variable/i.test(`${code} ${reason.description}`);
    return (
        <section data-testid="deploy-error-card" role="alert" className="rounded-2xl border bg-card p-6 shadow-xs">
            <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">The last deploy did not work</h2>
                <span className="flex items-center gap-1.5 rounded-full bg-danger-muted px-3 py-1 text-xs font-medium text-danger-text">
                    <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" /> Deploy failed
                </span>
            </div>
            <div className="mt-5 flex gap-4 rounded-xl border border-danger/25 bg-danger-muted/60 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-danger-text"><AlertTriangle className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                    <p className="font-semibold text-foreground">{reason.title}</p>
                    <p className="mt-0.5 text-sm text-danger-text">{reason.description}</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">{reason.fix}</p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
                <Button variant="dark" onClick={onViewLogs}><FileText aria-hidden="true" /> View logs</Button>
                {strictTypecheck ? (
                    <Button variant="outline" disabled={quickFixPending} onClick={() => onApplyEnvFix?.({ OPSLIN_NEXT_STRICT_TYPECHECK: null, OPSLIN_NEXT_IGNORE_TS_ERRORS: null })}>
                        {quickFixPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Turn off strict check and redeploy
                    </Button>
                ) : (
                    <Button asChild variant="outline">
                        <Link href={`/apps/${app.id}?section=environment`}><KeyRound aria-hidden="true" /> {envRelated ? "Fix variables" : "Check variables"}</Link>
                    </Button>
                )}
                {rollbackTarget ? (
                    <Button variant="outline" disabled={rollbackPending} onClick={() => onRollback(rollbackTarget.sha)}>
                        <RotateCcw aria-hidden="true" /> Roll back to previous
                    </Button>
                ) : (
                    <Button variant="outline" disabled={deployPending} onClick={onRedeploy}><RefreshCw aria-hidden="true" /> Try again</Button>
                )}
            </div>
            {liveRelease ? (
                <>
                    <div className="mt-5 flex items-center gap-3 rounded-xl border border-success/25 bg-success-muted/60 p-4">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="size-4" aria-hidden="true" /></span>
                        <div>
                            <p className="font-semibold text-foreground">Your previous version is still live</p>
                            <p className="text-sm text-muted-foreground"><span className="font-mono">{shortSha(liveRelease.sha)}</span> · Deployed {formatRelativeTime(liveRelease.finishedAt ?? liveRelease.startedAt)}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">Visitors can still use the previous working version.</p>
                </>
            ) : null}
        </section>
    );
}

// ── drawer ──────────────────────────────────────────────────────────────

type LogLevel = "ERROR" | "WARN" | "INFO";

function parseLog(raw: string) {
    return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).map((text) => {
        const lower = text.toLowerCase();
        const level = /\b(error|fatal|failed|exception)\b/.test(lower) ? "ERROR" : /\b(warn|warning)\b/.test(lower) ? "WARN" : "INFO";
        return { text, level: level as LogLevel };
    });
}

export function DeploymentDrawer({
    open,
    onOpenChange,
    deployment,
    app,
    logs,
    canRollback,
    previousTarget,
    rollbackPending,
    deployPending,
    onRollback,
    onRedeploy,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    deployment: DeploymentRecord | null;
    app: App;
    logs?: string | null;
    canRollback: boolean;
    previousTarget?: DeploymentRecord | null;
    rollbackPending?: boolean;
    deployPending?: boolean;
    onRollback: (sha: string) => void;
    onRedeploy: () => void;
}) {
    const [query, setQuery] = useState("");
    const raw = deployment?.healthLog || logs || "";
    const lines = useMemo(() => parseLog(raw), [raw]);
    const q = query.trim().toLowerCase();
    const shown = q ? lines.filter((line) => line.text.toLowerCase().includes(q)) : lines;
    const failed = deployment?.status === "failed" || deployment?.status === "aborted";
    const tone = failed ? "bg-danger-muted text-danger-text" : deployment?.status === "succeeded" || deployment?.status === "rolled_back" ? "bg-success-muted text-success-text" : "bg-info-muted text-info-text";
    const label = failed ? "Failed" : deployment?.status === "succeeded" ? "Success" : deployment?.status === "rolled_back" ? "Rolled back" : "In progress";

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(raw);
            toast.success("Logs copied");
        } catch {
            toast.error("Couldn't copy the logs");
        }
    };
    const download = () => {
        const url = URL.createObjectURL(new Blob([raw], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${app.name}-${deployment ? shortSha(deployment.sha) : "deploy"}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
                {deployment ? (
                    <>
                        <SheetHeader className="flex-row items-center gap-3 border-b px-6 py-4 pr-14">
                            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>{label}</span>
                            <SheetTitle className="text-base">Deployment details</SheetTitle>
                        </SheetHeader>
                        <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">{deployTitle(deployment)}</h2>
                            <SheetDescription className="mt-1">
                                <span className="font-mono">{shortSha(deployment.sha)}</span> · {app.branch ?? "main"} · {formatRelativeTime(deployment.startedAt)}
                                {durationLabel(deployment) ? ` · ${durationLabel(deployment)}` : ""}
                            </SheetDescription>
                            <Tabs defaultValue="logs" className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                                <TabsList variant="line">
                                    <TabsTrigger value="logs">Build logs</TabsTrigger>
                                    <TabsTrigger value="details">Details</TabsTrigger>
                                </TabsList>
                                <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                            <input aria-label="Search build logs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search build logs" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                                        </div>
                                        <Button variant="outline" size="icon" aria-label="Copy logs" disabled={!raw} onClick={() => void copy()}><Copy aria-hidden="true" /></Button>
                                        <Button variant="outline" size="icon" aria-label="Download logs" disabled={!raw} onClick={download}><Download aria-hidden="true" /></Button>
                                    </div>
                                    <div className="min-h-[260px] flex-1 overflow-auto rounded-xl bg-foreground py-2 font-mono text-xs text-background">
                                        {shown.length === 0 ? (
                                            <p className="px-4 py-6 text-center text-background/70">{raw ? "No lines match your search." : "No logs were saved for this deployment."}</p>
                                        ) : (
                                            shown.map((line, i) => (
                                                <div key={i} className={cn("flex gap-3 px-3 py-1.5", line.level === "ERROR" && "bg-red-500/20")}>
                                                    <span className="w-6 shrink-0 text-right text-background/40">{i + 1}</span>
                                                    <span className={cn("w-12 shrink-0 font-semibold", line.level === "ERROR" ? "text-red-300" : line.level === "WARN" ? "text-amber-300" : "text-sky-300")}>{line.level}</span>
                                                    <span className="min-w-0 break-words">{line.text}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    {failed && deployment.errorClassification?.title ? (
                                        <p className="rounded-lg bg-danger-muted px-3 py-2.5 text-sm text-danger-text">{deployment.errorClassification.title}{deployment.errorClassification.description ? `: ${deployment.errorClassification.description}` : ""}</p>
                                    ) : null}
                                </TabsContent>
                                <TabsContent value="details">
                                    <dl className="divide-y rounded-xl border text-sm">
                                        {[
                                            ["Status", label],
                                            ["Commit", shortSha(deployment.sha)],
                                            ["Branch", app.branch ?? "main"],
                                            ["Started by", deployActor(deployment)],
                                            ["Started", new Date(deployment.startedAt).toLocaleString()],
                                            ["Finished", deployment.finishedAt ? new Date(deployment.finishedAt).toLocaleString() : "Still running"],
                                            ["Previous version", deployment.previousSha ? shortSha(deployment.previousSha) : "None"],
                                            ["Runtime", deployment.buildpackName ? `${deployment.buildpackName}${deployment.buildpackVersion ? ` ${deployment.buildpackVersion}` : ""}` : "Auto-detected"],
                                        ].map(([k, v]) => (
                                            <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                                                <dt className="text-muted-foreground">{k}</dt>
                                                <dd className="truncate font-medium text-foreground">{v}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </TabsContent>
                            </Tabs>
                        </div>
                        <SheetFooter className="mt-0 flex-row justify-end gap-3 border-t px-6 py-4">
                            {canRollback ? (
                                <Button variant="outline" size="lg" disabled={rollbackPending} onClick={() => onRollback(deployment.sha)}><RotateCcw aria-hidden="true" /> Roll back to this</Button>
                            ) : failed && previousTarget ? (
                                <Button variant="outline" size="lg" disabled={rollbackPending} onClick={() => onRollback(previousTarget.sha)}><RotateCcw aria-hidden="true" /> Roll back to previous</Button>
                            ) : null}
                            <Button size="lg" disabled={deployPending} onClick={onRedeploy}><RefreshCw aria-hidden="true" /> Redeploy</Button>
                        </SheetFooter>
                    </>
                ) : (
                    <SheetTitle className="sr-only">Deployment details</SheetTitle>
                )}
            </SheetContent>
        </Sheet>
    );
}
