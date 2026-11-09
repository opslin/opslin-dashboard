"use client";

import { useState } from "react";
import { Check, Copy, FileWarning, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { looksSecret } from "@/components/apps/StackInputs";
import { settingNeeds, type FailureReport, type Need, type ReportOutcome } from "@/lib/failure-report";

/**
 * Doc 75 M6. What the owner reads when a deploy fails or pauses: one plain explanation in a dialog, never a wall of log text.
 * Order is the order of the questions a person asks: who has to act, what is missing (the highlighted box), what the app said
 * in its own words, what Opslin already did, what to do next, and only then the technical details, closed.
 * Everything comes from the report as plain text; nothing is rendered as markup.
 */

const OUTCOME_LABEL: Record<ReportOutcome, { label: string; tone: string }> = {
  needs_configuration: { label: "Needs your input", tone: "border-warning/25 bg-warning-muted text-warning-text" },
  application_defect: { label: "Fix in your project", tone: "border-warning/25 bg-warning-muted text-warning-text" },
  opslin_defect: { label: "Problem on Opslin's side", tone: "border-danger/30 bg-danger-muted text-danger-text" },
  infrastructure: { label: "Problem with the server", tone: "border-border bg-muted text-muted-foreground" },
  unknown: { label: "Could not tell exactly", tone: "border-border bg-muted text-muted-foreground" },
};

function CopyName({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy name"}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }, () => undefined);
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-warning-text/80 transition-[transform,background-color] duration-150 ease-out hover:bg-warning-text/10 hover:text-warning-text focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
    </button>
  );
}

export function FailureReportDialog({
  report, open, onOpenChange, onFillSettings, onDeployAgain, onContinue,
}: {
  report: FailureReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The settings the owner must give, handed to the deploy form so they can be typed above the Deploy button. */
  onFillSettings: (needs: Need[]) => void;
  onDeployAgain: () => void;
  /** With a resume target: saves the typed values on the failed app and redeploys it. Rejecting shows the error here. */
  onContinue?: (values: Record<string, string>) => Promise<void> | void;
}) {
  const outcome = OUTCOME_LABEL[report.outcome];
  const needs = settingNeeds(report);
  const canResume = Boolean(report.resume && onContinue && needs.length > 0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const filled = needs.every((need) => (values[need.name] ?? "").trim() !== "");
  const submit = async () => {
    if (!onContinue) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onContinue(Object.fromEntries(needs.map((need) => [need.name, (values[need.name] ?? "").trim()])));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" data-testid="failure-report-dialog">
        <DialogHeader className="shrink-0 gap-3 px-6 pb-4 pt-6 text-left">
          <span className={cn("w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium", outcome.tone)}>{outcome.label}</span>
          <DialogTitle className="text-lg leading-snug font-semibold">{report.title}</DialogTitle>
          {report.summary ? <DialogDescription className="text-sm leading-relaxed">{report.summary}</DialogDescription> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
          {report.missing.length > 0 ? (
            <section data-testid="failure-missing" className="overflow-hidden rounded-xl border border-warning/25 bg-warning-muted/60">
              <h3 className="px-4 pt-3 text-sm font-semibold text-warning-text">What is missing</h3>
              <ul className="divide-y divide-warning/15">
                {report.missing.map((item) => (
                  <li key={item.name} className="flex items-start gap-3 px-4 py-3">
                    {item.kind === "setting" ? <KeyRound className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden="true" /> : <FileWarning className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium text-warning-text [overflow-wrap:anywhere]">{item.name}</div>
                      {item.why ? <p className="mt-0.5 text-sm text-warning-text/80">{item.why}</p> : null}
                      {item.foundIn ? (
                        <p className="mt-1 text-xs text-warning-text/80">Found in <code className="rounded bg-warning-text/10 px-1 py-0.5 font-mono">{item.foundIn}</code></p>
                      ) : null}
                      {item.howToFix && !(canResume && item.kind === "setting") ? <p className="mt-1.5 text-sm text-warning-text">{item.howToFix}</p> : null}
                      {canResume && item.kind === "setting" ? (
                        <Input
                          aria-label={item.name}
                          type={looksSecret(item.name) ? "password" : "text"}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Value"
                          value={values[item.name] ?? ""}
                          disabled={saving}
                          onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.target.value }))}
                          className="mt-2 bg-background font-mono text-sm text-foreground"
                        />
                      ) : null}
                    </div>
                    <CopyName value={item.name} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.appSaid ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">What the app said</h3>
              <blockquote className="rounded-lg border bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">{report.appSaid}</blockquote>
            </section>
          ) : null}

          {report.opslinDid.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">What Opslin already did</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {report.opslinDid.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          ) : null}

          {report.nextSteps.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">What to do next</h3>
              <ol data-testid="failure-steps" className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                {report.nextSteps.map((line) => <li key={line}>{line}</li>)}
              </ol>
            </section>
          ) : null}

          {report.technical ? (
            <details className="group rounded-lg border">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>Technical details</span>
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{report.technical}</pre>
            </details>
          ) : null}
        </div>

        {saveError ? <p role="alert" className="shrink-0 border-t bg-danger-muted px-6 py-2 text-sm text-danger-text">{saveError}</p> : null}
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canResume ? (
            <Button type="button" variant="dark" disabled={!filled || saving} onClick={() => void submit()}>{saving ? "Saving…" : "Add and continue"}</Button>
          ) : needs.length > 0 ? (
            <Button type="button" variant="dark" onClick={() => { onFillSettings(needs); onOpenChange(false); }}>Add the settings and deploy again</Button>
          ) : (
            <Button type="button" variant="dark" onClick={() => { onDeployAgain(); onOpenChange(false); }}>Deploy again</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
