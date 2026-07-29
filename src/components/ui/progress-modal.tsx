"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressStep {
    label: string;
    status: "pending" | "running" | "completed" | "error";
}

interface ProgressModalProps {
    isOpen: boolean;
    title: string;
    icon?: ReactNode;
    steps?: ProgressStep[];
    logs?: string;
    error?: string;
    onClose?: () => void;
    progress?: number;
}

export function ProgressModal({
    isOpen,
    title,
    icon,
    steps = [],
    logs,
    error,
    onClose,
    progress = 0,
}: ProgressModalProps) {
    const logRef = useRef<HTMLPreElement | null>(null);

    const isComplete = steps.every(s => s.status === "completed");
    const hasError = steps.some(s => s.status === "error") || !!error;
    const visibleLogs = useMemo(() => {
        if (!logs) return "";
        return logs.split("\n").slice(-200).join("\n");
    }, [logs]);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [visibleLogs]);

    if (!isOpen) return null;

    return (
        <div className={cn(
            "fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
            <div className={cn(
                "bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 transform transition-all",
                isOpen ? "scale-100" : "scale-95"
            )}>
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b">
                    <div className={cn(
                        "p-2 rounded-lg",
                        hasError ? "bg-red-100 text-red-600" :
                            isComplete ? "bg-green-100 text-green-600" :
                                "bg-blue-100 text-blue-600"
                    )}>
                        {hasError ? <XCircle className="h-6 w-6" /> :
                            isComplete ? <CheckCircle2 className="h-6 w-6" /> :
                                icon || <Loader2 className="h-6 w-6 animate-spin" />}
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">{title}</h3>
                        <p className="text-sm text-slate-500">
                            {hasError ? "Operation failed" :
                                isComplete ? "Completed successfully" :
                                    "Please wait..."}
                        </p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="px-5 py-3">
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all duration-500 ease-out rounded-full",
                                hasError ? "bg-red-500" :
                                    isComplete ? "bg-green-500" :
                                        "bg-blue-500"
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-center text-sm text-slate-500 mt-1">{progress}%</p>
                </div>

                {/* Steps */}
                {steps.length > 0 && (
                    <div className="px-5 py-3 space-y-2">
                        {steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-3">
                                {step.status === "completed" && (
                                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                                )}
                                {step.status === "running" && (
                                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
                                )}
                                {step.status === "pending" && (
                                    <Circle className="h-5 w-5 text-slate-300 flex-shrink-0" />
                                )}
                                {step.status === "error" && (
                                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                                )}
                                <span className={cn(
                                    "text-sm",
                                    step.status === "completed" && "text-green-700",
                                    step.status === "running" && "text-blue-700 font-medium",
                                    step.status === "pending" && "text-slate-400",
                                    step.status === "error" && "text-red-700"
                                )}>
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mx-5 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-red-800">Error</p>
                                <p className="text-sm text-red-600 mt-1">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Logs Preview */}
                {logs && (
                    <div className="px-5 pb-3">
                        <details className="group" open>
                            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                                View live deploy logs
                            </summary>
                            <div className="mt-2 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(logs)}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                >
                                    Copy all
                                </button>
                            </div>
                            <pre
                                ref={logRef}
                                className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap"
                            >
                                {visibleLogs}
                            </pre>
                        </details>
                    </div>
                )}

                {/* Footer */}
                {(isComplete || hasError) && onClose && (
                    <div className="p-4 border-t bg-slate-50 rounded-b-xl">
                        <button
                            onClick={onClose}
                            className={cn(
                                "w-full py-2 px-4 rounded-lg font-medium transition-colors",
                                hasError
                                    ? "bg-danger text-danger-foreground hover:bg-danger/90"
                                    : "bg-success text-success-foreground hover:bg-success/90"
                            )}
                        >
                            {hasError ? "Close" : "Done"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Human-readable error parser
export function parseError(error: string): string {
    const normalized = error.toLowerCase();
    const isDockerDaemonOrSocketError =
        /cannot connect to (?:the )?docker daemon/.test(normalized) ||
        /is the docker daemon running/.test(normalized) ||
        /docker daemon.*(?:unreachable|not running|unavailable)/.test(normalized) ||
        /docker\.sock|\/var\/run\/docker\.sock|unix:\/\/.*docker/.test(normalized);
    const isLocalMacDockerDesktopError =
        /docker desktop|com\.docker\.docker|docker\.raw\.sock|darwin|macos|mac os/.test(normalized);

    if (error.includes("port is already allocated")) {
        const match = error.match(/Bind for [\d.:]+:(\d+) failed/);
        const port = match ? match[1] : "unknown";
        return `Port ${port} is already in use. Please stop any other applications using this port.`;
    }
    // Lock contention — both the deploy-lock-busy constant and the
    // generic "agent lock busy for <serverId>/<jobType>" emitted by the
    // worker for non-deploy jobs (delete_app, stop_app, restart_app).
    // The raw form is hostile to users; surface a clear next action.
    if (/agent lock busy for/i.test(error) ||
        /another deployment is already running for this app/i.test(normalized)) {
        return "Another job is currently using this app's agent (a deploy, restart, or stop is in flight). Wait a few seconds, then click Retry. If the problem persists, the previous job may be stuck — delete it from the Deployments tab or contact support.";
    }
    if (error.includes("Dockerfile: no such file")) {
        return "No Dockerfile found. Please ensure your project has a valid Dockerfile.";
    }
    if (error.includes("docker-compose") && error.includes("not found")) {
        return "Docker Compose is not installed on the server. Install the Docker Compose plugin or CLI on the VPS, then retry.";
    }
    if (isDockerDaemonOrSocketError) {
        if (isLocalMacDockerDesktopError) {
            return "Docker daemon is not reachable on this local Mac. Start Docker Desktop, then retry.";
        }
        return "Docker daemon is not reachable on the server. Start or repair Docker on the VPS, then retry.";
    }
    if (error.includes("permission denied")) {
        return "Permission denied. Docker may require elevated privileges.";
    }
    if (error.includes("out of memory") || error.includes("OOM")) {
        return "Container ran out of memory. Consider increasing memory limits.";
    }
    if (error.includes("network") && error.includes("not found")) {
        return "Docker network not found. Try running 'docker network create' or restart Docker.";
    }
    return error;
}
