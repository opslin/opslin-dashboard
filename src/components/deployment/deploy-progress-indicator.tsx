"use client";

import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    Clock3,
    Loader2,
    RotateCcw,
    XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface DeployProgressProps {
    phase: string;
    line: string;
    percent: number;
    status: "running" | "completed" | "failed";
}

type RetryProps = {
    details?: string | null;
    onRetry?: () => void;
    retryPending?: boolean;
};

function clampPercent(percent: number) {
    return Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : 0)));
}

export function extractElapsedTime(line: string) {
    const match = line.match(/(\d+(?:h|m|s)(?:\s+\d+(?:h|m|s))*\s+elapsed)/i);
    return match?.[1] ?? null;
}

function StatusLine({ line, className }: { line: string; className?: string }) {
    if (!line.trim()) {
        return null;
    }

    return <p className={cn("mt-2 text-sm leading-5 text-muted-foreground", className)}>{line}</p>;
}

function queuedStatusLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed || /queued on server|another deployment is currently building/i.test(trimmed)) {
        return "Another deployment is currently building on this server. This deployment will continue automatically when the server is free. No action needed.";
    }
    return trimmed;
}

export function DeployProgressIndicator({ phase, line, percent, status }: DeployProgressProps) {
    const normalizedPhase = phase.toLowerCase();
    const clampedPercent = clampPercent(percent);
    const elapsed = extractElapsedTime(line);

    if (normalizedPhase === "queued") {
        return (
            <div className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3">
                <Badge className="border-transparent bg-warning-muted text-warning-text">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Queued on Server
                </Badge>
                <StatusLine line={queuedStatusLine(line)} className="text-warning-text" />
            </div>
        );
    }

    if (normalizedPhase === "warning") {
        return (
            <Alert className="border-warning/30 bg-warning-muted text-warning-text">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Resource warning</AlertTitle>
                <AlertDescription className="text-warning-text">
                    {line || "The agent reported a deployment warning."}
                </AlertDescription>
            </Alert>
        );
    }

    if (normalizedPhase === "diagnostics") {
        return (
            <details className="group rounded-lg border border-border bg-muted/40 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                    <span className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Diagnostics
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <StatusLine line={line} className="text-muted-foreground" />
            </details>
        );
    }

    if (normalizedPhase === "building" || normalizedPhase === "build") {
        return (
            <div className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-info/30 bg-info-muted text-info-text">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            Building
                        </Badge>
                        {elapsed && <span className="text-xs font-medium text-muted-foreground">{elapsed}</span>}
                    </div>
                    <span className="text-sm font-medium text-foreground">{clampedPercent}%</span>
                </div>
                <Progress value={clampedPercent} className="mt-3" />
                <StatusLine line={line} />
            </div>
        );
    }

    if (normalizedPhase === "health" || normalizedPhase === "healthcheck") {
        return (
            <div className="rounded-lg border border-info/30 bg-info-muted px-4 py-3">
                <Badge variant="outline" className="border-info/30 bg-info-muted text-info-text">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    Health Check
                </Badge>
                <StatusLine line={line} className="text-info-text" />
            </div>
        );
    }

    if (normalizedPhase === "completed" || status === "completed") {
        return (
            <div className="rounded-lg border border-success/30 bg-success-muted px-4 py-3">
                <Badge className="border-transparent bg-success-muted text-success-text">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Deployment Complete
                </Badge>
                <StatusLine line={line} className="text-success-text" />
            </div>
        );
    }

    if (normalizedPhase === "failed" || status === "failed") {
        return (
            <Alert className="border-danger/30 bg-danger-muted text-danger-text">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Deployment failed</AlertTitle>
                <AlertDescription className="text-danger-text">
                    {line || "The deployment did not complete."}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                    {phase || "Deployment"}
                </Badge>
                <span className="text-sm font-medium text-foreground">{clampedPercent}%</span>
            </div>
            {status === "running" && <Progress value={clampedPercent} className="mt-3" />}
            <StatusLine line={line} />
        </div>
    );
}

export function PreviousVersionRunningNotice({ details, onRetry, retryPending = false }: RetryProps) {
    return (
        <div className="rounded-lg border border-success/30 bg-success-muted px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Badge className="border-transparent bg-success-muted text-success-text">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Previous version still running
                </Badge>
                {onRetry && (
                    <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retryPending}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        {retryPending ? "Retrying..." : "Retry Deploy"}
                    </Button>
                )}
            </div>
            {details && (
                <details className="group mt-3 rounded-md border border-success/30 bg-card/70 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-success-text">
                        Failure details
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80">
                        {details}
                    </pre>
                </details>
            )}
        </div>
    );
}
