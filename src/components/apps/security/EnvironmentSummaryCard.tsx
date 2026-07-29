"use client";

import Link from "next/link";
import { KeyRound, AlertCircle, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * EnvironmentSummaryCard — displays the count of environment variables
 * without exposing any key or value, a navigation control to env-var
 * management, and an encryption-at-rest statement.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 * Design: Property P12
 */

export interface EnvironmentSummaryCardProps {
  envVars: Record<string, string> | null | undefined;
  appId: string;
}

export function EnvironmentSummaryCard({
  envVars,
  appId,
}: EnvironmentSummaryCardProps): React.JSX.Element {
  // When envVars is undefined, the fetch failed — show only a neutral error indicator
  if (envVars === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" />
            Environment Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="env-error-indicator"
            role="status"
          >
            <AlertCircle className="size-4" />
            <span>Unable to load environment variable information.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compute count safely — envVars can be null (meaning 0 configured)
  const count = Object.keys(envVars ?? {}).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" />
          Environment Variables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Count display */}
        <p className="text-sm text-foreground" data-testid="env-count">
          <span className="font-semibold">{count}</span>{" "}
          {count === 1 ? "variable" : "variables"} configured
        </p>

        {/* Navigation control to env-var management */}
        <Link
          href={`/apps/${appId}?settings=environment`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          data-testid="env-manage-link"
        >
          Manage environment variables
        </Link>

        {/* Encryption-at-rest statement (≤120 chars) */}
        <div className="flex items-start gap-2" data-testid="env-encryption-statement">
          <Shield className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Environment variable values are encrypted at rest using AES-256-GCM.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
