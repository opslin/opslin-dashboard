"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Loader2, PlugZap, XCircle } from "lucide-react";
import {
    createInitialDeployStages,
    formatElapsed,
    type DeployStageState,
} from "@/lib/deploy-progress";
import { cn } from "@/lib/utils";

type DeployProgressProps = {
    title?: string;
    percentage: number;
    stages?: DeployStageState[];
    logLines?: string[];
    connectionStatus?: "connecting" | "connected" | "reconnecting" | "closed";
    error?: string;
};

const rowHeight = 20;

function StageIcon({ status }: { status: DeployStageState["status"] }) {
    if (status === "completed") {
        return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />;
    }
    if (status === "running") {
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />;
    }
    if (status === "error") {
        return <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    }
    return <Circle className="h-5 w-5 text-slate-300" aria-hidden="true" />;
}

export function DeployProgress({
    title = "Deployment progress",
    percentage,
    stages = createInitialDeployStages(),
    logLines = [],
    connectionStatus = "connected",
    error,
}: DeployProgressProps) {
    const [logsOpen, setLogsOpen] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(240);
    const logViewportRef = useRef<HTMLDivElement | null>(null);
    const clampedPercentage = Math.min(100, Math.max(0, Math.round(percentage)));

    const visibleLogWindow = useMemo(() => {
        const overscan = 8;
        const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
        const count = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
        const end = Math.min(logLines.length, start + count);
        return {
            start,
            end,
            items: logLines.slice(start, end),
            before: start * rowHeight,
            after: Math.max(0, (logLines.length - end) * rowHeight),
        };
    }, [logLines, scrollTop, viewportHeight]);

    useEffect(() => {
        const node = logViewportRef.current;
        if (!node || !logsOpen || !autoScroll) {
            return;
        }
        node.scrollTop = node.scrollHeight;
    }, [autoScroll, logLines.length, logsOpen]);

    const handleLogScroll = () => {
        const node = logViewportRef.current;
        if (!node) {
            return;
        }
        setScrollTop(node.scrollTop);
        setViewportHeight(node.clientHeight || 240);
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        setAutoScroll(distanceFromBottom < rowHeight * 4);
    };

    const connectionCopy = connectionStatus === "reconnecting"
        ? "Reconnecting..."
        : connectionStatus === "connecting"
            ? "Connecting..."
            : connectionStatus === "closed"
                ? "Connection closed"
                : "Live";

    return (
        <section
            data-testid="deploy-progress"
            className="rounded-lg border border-slate-200 bg-white shadow-sm"
            aria-live="polite"
        >
            <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
                        <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                            <PlugZap className="h-4 w-4" aria-hidden="true" />
                            <span>{connectionCopy}</span>
                        </div>
                    </div>
                    <div className="text-sm font-medium text-slate-700">{clampedPercentage}%</div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-100">
                    <div
                        className={cn(
                            "h-2 rounded-full transition-all duration-500",
                            error ? "bg-red-600" : clampedPercentage === 100 ? "bg-emerald-600" : "bg-blue-600"
                        )}
                        style={{ width: `${clampedPercentage}%` }}
                    />
                </div>
            </div>

            <div className="grid gap-0 md:grid-cols-2">
                {stages.map((stage) => (
                    <div
                        key={stage.key}
                        data-testid={`deploy-stage-${stage.key}`}
                        className="flex min-h-24 gap-3 border-b border-slate-100 px-5 py-4 even:md:border-l last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
                    >
                        <StageIcon status={stage.status} />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="font-medium text-slate-950">{stage.label}</p>
                                {stage.elapsedMs !== undefined && (
                                    <span className="text-xs text-slate-500">{formatElapsed(stage.elapsedMs)}</span>
                                )}
                            </div>
                            {stage.description && (
                                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{stage.description}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="border-t border-slate-100">
                <button
                    type="button"
                    data-testid="build-logs-toggle"
                    onClick={() => setLogsOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <span>Build logs ({logLines.length})</span>
                    <ChevronDown
                        className={cn("h-4 w-4 transition-transform", logsOpen && "rotate-180")}
                        aria-hidden="true"
                    />
                </button>

                {logsOpen && (
                    <div className="border-t border-slate-100 bg-slate-950 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                                {autoScroll ? "Auto-scroll on" : "Auto-scroll paused"}
                            </span>
                            {!autoScroll && (
                                <button
                                    type="button"
                                    onClick={() => setAutoScroll(true)}
                                    className="font-medium text-blue-300 hover:text-blue-200"
                                >
                                    Resume
                                </button>
                            )}
                        </div>
                        <div
                            ref={logViewportRef}
                            data-testid="build-log-panel"
                            onScroll={handleLogScroll}
                            className="h-64 overflow-auto rounded-md bg-slate-900 font-mono text-xs leading-5 text-slate-100"
                        >
                            <div style={{ height: visibleLogWindow.before }} />
                            {visibleLogWindow.items.length > 0 ? (
                                visibleLogWindow.items.map((line, index) => (
                                    <div
                                        key={`${visibleLogWindow.start + index}-${line}`}
                                        className="min-h-5 whitespace-pre-wrap px-3"
                                    >
                                        {line}
                                    </div>
                                ))
                            ) : (
                                <div className="px-3 py-3 text-slate-400">Waiting for build output...</div>
                            )}
                            <div style={{ height: visibleLogWindow.after }} />
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
