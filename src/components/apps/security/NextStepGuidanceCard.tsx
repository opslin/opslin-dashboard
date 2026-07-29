"use client";

import { Compass, ArrowRight, CheckCircle2, Globe, ArrowUpCircle, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { NextStep } from "@/lib/security/shield-state";

/**
 * NextStepGuidanceCard — displays exactly one suggested next action based on
 * the `step.kind` discriminator. Navigation is handled via the supplied
 * `onActivate(step)` callback (the page wires this to `router.push`).
 *
 * All five branches use neutral wording and zero red|orange|yellow|amber class
 * tokens — even the troubleshoot-error branch.
 *
 * Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.8
 */

export interface NextStepGuidanceCardProps {
  step: NextStep;
  onActivate: (step: NextStep) => void;
}

export function NextStepGuidanceCard({
  step,
  onActivate,
}: NextStepGuidanceCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4 text-muted-foreground" />
          Next Step
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderStepContent(step, onActivate)}
      </CardContent>
    </Card>
  );
}

function renderStepContent(
  step: NextStep,
  onActivate: (step: NextStep) => void
): React.JSX.Element {
  switch (step.kind) {
    case "troubleshoot-error":
      return (
        <div
          className="flex items-center justify-between gap-3"
          data-testid="next-step-troubleshoot-error"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Review deployment details to resolve the current issue.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onActivate(step)}
            data-testid="next-step-action"
          >
            View deployments
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      );

    case "configure-domain":
      return (
        <div
          className="flex items-center justify-between gap-3"
          data-testid="next-step-configure-domain"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Configure a custom domain to enable full protection coverage.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onActivate(step)}
            data-testid="next-step-action"
          >
            Configure domain
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      );

    case "upgrade-plan":
      return (
        <div
          className="flex items-center justify-between gap-3"
          data-testid="next-step-upgrade-plan"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ArrowUpCircle className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Upgrade to {step.targetTier} to unlock additional security shields.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onActivate(step)}
            data-testid="next-step-action"
          >
            View plans
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      );

    case "all-protected":
      return (
        <div
          className="flex items-center gap-2"
          data-testid="next-step-all-protected"
        >
          <CheckCircle2 className="size-4 shrink-0 text-success-text" />
          <p className="text-sm text-foreground">
            Your app is fully protected and production-ready.
          </p>
        </div>
      );

    case "no-action":
      return (
        <div
          className="flex items-center gap-2"
          data-testid="next-step-no-action"
        >
          <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No action required at this time.
          </p>
        </div>
      );
  }
}
