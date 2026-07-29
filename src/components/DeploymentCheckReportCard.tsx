"use client";

import { Activity, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DeploymentCheckReport } from "@/lib/api";
import { cn } from "@/lib/utils";

type DeploymentCheckReportCardProps = {
    idPrefix?: string;
    report?: DeploymentCheckReport | null;
};

function metricValue(value?: number | null, suffix = "") {
    return typeof value === "number" ? `${value}${suffix}` : "n/a";
}

function percentage(value: number) {
    return `${Math.round(value * 10) / 10}%`;
}

function toneForReport(report: DeploymentCheckReport) {
    if (report.status === "failed" || report.autoRolledBack || report.containerRestarted || report.errorRate && report.errorRate > 5) {
        return "fail";
    }
    if (!report.healthPassed || !report.smokePassed || report.errorRate && report.errorRate > 0) {
        return "warn";
    }
    return "pass";
}

function toneClasses(tone: "pass" | "warn" | "fail") {
    if (tone === "pass") {
        return "border-success/25 bg-success-muted text-success-text";
    }
    if (tone === "warn") {
        return "border-warning/25 bg-warning-muted text-warning-text";
    }
    return "border-danger/25 bg-danger-muted text-danger-text";
}

function ResultIcon({ passed }: { passed: boolean }) {
    return passed
        ? <CheckCircle2 className="h-4 w-4 text-success-text" />
        : <XCircle className="h-4 w-4 text-danger-text" />;
}

export function DeploymentCheckReportCard({
    idPrefix = "deployment-check-report",
    report,
}: DeploymentCheckReportCardProps) {
    if (!report) {
        return null;
    }

    const tone = toneForReport(report);
    const successRate = report.totalRequests > 0
        ? (report.successRequests / report.totalRequests) * 100
        : 0;

    const rows = [
        {
            label: "Health Check",
            value: `${report.healthStatusCode ?? "n/a"} ${report.healthStatusCode ? "OK" : ""} (${metricValue(report.healthResponseMs, "ms")})`,
            passed: report.healthPassed,
        },
        {
            label: "Smoke Test",
            value: `${report.smokeStatusCode ?? "n/a"} ${report.smokeStatusCode ? "OK" : ""} (${metricValue(report.smokeResponseMs, "ms")})`,
            passed: report.smokePassed,
        },
        {
            label: "Virtual Users",
            value: `${report.virtualUsers} users x ${report.durationSeconds} seconds`,
            passed: true,
        },
        {
            label: "Total Requests",
            value: `${report.totalRequests}`,
            passed: report.failedRequests === 0,
        },
        {
            label: "Success Rate",
            value: percentage(successRate),
            passed: successRate >= 99,
        },
        {
            label: "p50 Latency",
            value: metricValue(report.p50Ms, "ms"),
            passed: true,
        },
        {
            label: "p95 Latency",
            value: metricValue(report.p95Ms, "ms"),
            passed: !report.p95Ms || report.p95Ms < 750,
        },
        {
            label: "Error Rate",
            value: percentage(report.errorRate ?? 0),
            passed: !report.errorRate || report.errorRate === 0,
        },
        {
            label: "Container",
            value: report.containerRestarted ? "Restart detected" : "Stable (no restart)",
            passed: !report.containerRestarted,
        },
    ];

    return (
        <section id={`${idPrefix}-section`} className="dashboard-surface overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="dashboard-section-label">Deployment Health Report</p>
                    <h2 className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Activity className="h-5 w-5 text-primary" />
                        Post-deploy checks
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {report.autoRolledBack ? (
                        <Badge variant="outline" className="rounded-md border-danger/25 bg-danger-muted text-danger-text">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Auto rolled back
                        </Badge>
                    ) : null}
                    <Badge variant="outline" className={cn("rounded-md", toneClasses(tone))}>
                        {tone === "pass" ? "Passed" : tone === "warn" ? "Warning" : "Failed"}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-0 md:grid-cols-3">
                {rows.map((row) => (
                    <div
                        id={`${idPrefix}-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        key={row.label}
                        className="flex min-h-24 items-start gap-3 border-b border-border/70 px-5 py-4 md:border-r md:[&:nth-child(3n)]:border-r-0"
                    >
                        <ResultIcon passed={row.passed} />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{row.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{row.value}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
