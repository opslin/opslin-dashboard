"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, ClipboardCopy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeployErrorClassification } from "@/lib/api";
import { cn } from "@/lib/utils";

type ErrorCardProps = {
    classification?: DeployErrorClassification | null;
    rawError?: string | null;
    onRetry?: () => void;
    retryDisabled?: boolean;
    // When provided, ErrorCard renders a per-classification "Quick fix"
    // affordance that asks the parent to merge `envPatch` into the app's
    // env vars and trigger a redeploy. The parent owns the merge with the
    // existing env-var map and the redeploy mutation; the card stays
    // presentation-only.
    //
    // A `null` value for a key signals removal, which is what the
    // post-v1.1.0 NEXT_TYPECHECK_FAILED quick-fix uses (it removes the
    // OPSLIN_NEXT_STRICT_TYPECHECK opt-in so the buildpack falls back to
    // the new "ignore TS errors by default" behaviour).
    onApplyEnvFix?: (envPatch: Record<string, string | null>) => void;
    quickFixPending?: boolean;
    className?: string;
};

const fallbackDocsLink = "/docs/deployments/troubleshooting#unknown";

const fallbackClassification: DeployErrorClassification = {
    category: "UNKNOWN",
    title: "Deployment failed",
    summary: "Opslin could not classify this deploy failure from the captured logs.",
    suggestion: "Open the build logs, fix the first failing command, and retry the deploy.",
    logSnippet: "",
    docsLink: fallbackDocsLink,
};

function stringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return stringValue(value);
}

function firstString(...values: unknown[]): string | null {
    for (const value of values) {
        const normalized = stringValue(value);
        if (normalized) {
            return normalized;
        }
    }
    return null;
}

function maskSecrets(value: string) {
    return value
        .replace(/\b(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
        .replace(/\b(cookie\s*:\s*)[^\n\r]+/gi, "$1[redacted]")
        .replace(/\bstp_(?:live|test)_[A-Za-z0-9_-]+/g, "stp_[redacted]")
        .replace(/\b([A-Z0-9_]*URL)\s*=\s*[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "$1=[redacted]")
        .replace(/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|KEY|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=[redacted]")
        .replace(/\b(password|token|secret|api[_-]?key|keyHash|registryPassword|registry password|cfToken|cloudflare|privateKey|webhookSecret|cookie|auth(?:orization)?)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
        .replace(/\b(postgres|postgresql|mysql|redis|mongodb):\/\/[^\s]+/gi, "$1://[redacted]");
}

function lastLines(value: unknown): string | null {
    if (Array.isArray(value)) {
        const lines = value
            .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
            .slice(-8);
        return lines.length ? lines.join("\n") : null;
    }

    const text = stringValue(value);
    if (!text) {
        return null;
    }

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .slice(-8);
    return lines.length ? lines.join("\n") : null;
}

function extractExitCode(...values: Array<string | null | undefined>) {
    const text = values.filter(Boolean).join("\n");
    const match = text.match(/(?:candidate\s*)?exit(?:Code|\s+code)?[=:]?\s*([0-9]+)/i);
    return match?.[1] || null;
}

function buildDiagnosticsText(
    details: DeployErrorClassification,
    code: string,
    logSnippet: string | null,
    rawError?: string | null
) {
    const diagnostics = details.diagnostics || {};
    const healthPath = firstString(diagnostics.healthPath, diagnostics.healthCheckPath);
    const candidateExitCode =
        numberValue(diagnostics.candidateExitCode) ||
        numberValue(diagnostics.exitCode) ||
        extractExitCode(logSnippet, rawError);
    const buildpack = firstString(diagnostics.buildpack, diagnostics.buildpackOverride);
    const runtime = firstString(diagnostics.runtime, diagnostics.detectedRuntime);
    const diagnosticLogs =
        lastLines(diagnostics.lastLogLines) ||
        lastLines(logSnippet) ||
        lastLines(rawError);

    const lines = [
        "Opslin deploy diagnostics",
        `Classifier: ${code}`,
        healthPath ? `Health path: ${healthPath}` : null,
        candidateExitCode ? `Candidate exit code: ${candidateExitCode}` : null,
        buildpack ? `Buildpack: ${buildpack}` : null,
        runtime ? `Runtime: ${runtime}` : null,
        diagnosticLogs ? `Last log lines:\n${diagnosticLogs}` : null,
    ].filter((line): line is string => Boolean(line));

    return maskSecrets(lines.join("\n"));
}

export function ErrorCard({
    classification,
    rawError,
    onRetry,
    retryDisabled = false,
    onApplyEnvFix,
    quickFixPending = false,
    className,
}: ErrorCardProps) {
    const details = classification || {
        ...fallbackClassification,
        logSnippet: rawError || fallbackClassification.logSnippet,
    };
    const docsLink: string = details.docsLink?.trim() || fallbackDocsLink;
    const code = firstString(details.code, details.category) || "UNKNOWN";
    const description =
        firstString(details.description, details.summary) ||
        fallbackClassification.summary ||
        "Opslin could not classify this deploy failure from the captured logs.";
    const suggestedFix =
        firstString(details.suggestedFix, details.suggestion) ||
        fallbackClassification.suggestion ||
        "Open the build logs, fix the first failing command, and retry the deploy.";
    const logSnippet = firstString(details.logSnippet, rawError);
    const diagnosticsText = buildDiagnosticsText(details, code, logSnippet, rawError);
    // The classifier's structured `firstFailureLocation` (path:line[:col])
    // lets the card show the offending file inline. The dashboard used to
    // hide the path inside the collapsed log, which left users hunting
    // through pages of BuildKit output for a one-line type error.
    const firstFailureLocation = details.diagnostics?.firstFailureLocation || null;
    const firstFailureLocationLabel = firstFailureLocation
        ? `${firstFailureLocation.file}:${firstFailureLocation.line}${
              firstFailureLocation.column ? `:${firstFailureLocation.column}` : ""
          }`
        : null;
    // Per-classification quick-fix wiring. Today only NEXT_TYPECHECK_FAILED
    // surfaces a one-click affordance; new categories register here.
    //
    // Post-v1.1.0 the Next.js buildpack ignores TypeScript errors by
    // default, so a failed type-check means the user opted INTO strict
    // mode via OPSLIN_NEXT_STRICT_TYPECHECK=true (or the legacy
    // OPSLIN_NEXT_IGNORE_TS_ERRORS=false). The cleanest fix is to remove
    // those opt-ins so the buildpack falls back to default behaviour —
    // setting them to "false" would also work but leaves stale state in
    // the env-vars panel. `null` in the patch means "delete the key".
    const envQuickFix =
        code === "NEXT_TYPECHECK_FAILED"
            ? {
                  label: "Disable strict TypeScript check and redeploy",
                  patch: {
                      OPSLIN_NEXT_STRICT_TYPECHECK: null,
                      OPSLIN_NEXT_IGNORE_TS_ERRORS: null,
                  } as Record<string, string | null>,
                  hint:
                      "Opslin ignores Next.js TypeScript errors by default. Strict checking is on for this app — clicking below removes the opt-in and redeploys with the default behaviour. Fix the underlying type when you can; the strict gate is the right long-term default.",
              }
            : null;
    const copyDiagnostics = () => {
        if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
            return;
        }
        void navigator.clipboard.writeText(diagnosticsText);
    };

    return (
        <section
            data-testid="deploy-error-card"
            className={cn(
                "rounded-lg border border-danger/30 bg-danger-muted p-4 text-foreground shadow-sm transition-all duration-200",
                className
            )}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-muted text-danger">
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{details.title}</h3>
                            <span className="rounded-full bg-danger-muted px-2 py-0.5 font-mono text-[11px] font-medium text-danger">
                                {code}
                            </span>
                            {firstFailureLocationLabel ? (
                                <span
                                    className="rounded-full border border-danger/30 bg-card px-2 py-0.5 font-mono text-[11px] font-medium text-danger"
                                    title="First failure location reported in the build log"
                                >
                                    {firstFailureLocationLabel}
                                </span>
                            ) : null}
                        </div>
                        <p className="text-sm font-medium text-foreground">Root cause: {details.title}</p>
                        <p className="text-sm text-foreground/80">{description}</p>
                        <div className="rounded-md border border-danger/30 bg-card/70 px-3 py-2 text-sm text-foreground">
                            <span className="font-medium">Suggested fix: </span>
                            {suggestedFix}
                        </div>
                        {envQuickFix && onApplyEnvFix ? (
                            <div className="rounded-md border border-danger/30 bg-card/70 px-3 py-2 text-sm text-foreground">
                                <p className="font-medium">Quick fix</p>
                                <p className="mt-1 text-foreground/85">{envQuickFix.hint}</p>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => onApplyEnvFix(envQuickFix.patch)}
                                    disabled={quickFixPending || retryDisabled}
                                    className="mt-2 bg-danger text-danger-foreground hover:bg-danger/90"
                                >
                                    {quickFixPending ? "Applying…" : envQuickFix.label}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyDiagnostics}
                        className="border-danger/30 bg-card text-danger hover:bg-danger-muted"
                    >
                        <ClipboardCopy className="mr-2 h-4 w-4" />
                        Copy diagnostics
                    </Button>
                    <Button asChild variant="outline" size="sm" className="border-danger/30 bg-card text-danger hover:bg-danger-muted">
                        <Link href={docsLink}>
                            <BookOpen className="mr-2 h-4 w-4" />
                            See Docs
                        </Link>
                    </Button>
                    {onRetry && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={onRetry}
                            disabled={retryDisabled}
                            className="bg-danger text-danger-foreground hover:bg-danger/90"
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry Deploy
                        </Button>
                    )}
                </div>
            </div>

            <details className="mt-4">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-danger">
                    Diagnostics
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-danger/30 bg-card/80 p-3 font-mono text-xs leading-5 text-foreground">
                    {diagnosticsText}
                </pre>
            </details>

            {logSnippet && (
                <details className="mt-4">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-danger">
                        Error snippet
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-inverse p-3 font-mono text-xs leading-5 text-text-on-inverse-muted">
                        {logSnippet}
                    </pre>
                </details>
            )}
        </section>
    );
}
