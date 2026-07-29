"use client";

import { useState, useCallback, useRef } from "react";
import { Copy, Check, Globe, Lock, Loader2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * DomainSummaryCard — displays the app's primary domain (or fallback URL),
 * the SSL indicator, and a single copy action.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.8, 8.9, 8.10
 */

export interface DomainSummaryCardProps {
  domain: string | null;
  fallbackUrl: string;
  sslIndicator: "Secured" | "Provisioning" | "Not_Configured";
}

type CopyState = "idle" | "success" | "failed";

export function DomainSummaryCard({
  domain,
  fallbackUrl,
  sslIndicator,
}: DomainSummaryCardProps): React.JSX.Element {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Display the domain when present, otherwise the fallback URL
  const displayedUrl = domain ?? fallbackUrl;

  // Compute the URL to copy: prepend https:// when no scheme is present
  const urlToCopy = /^https?:\/\//i.test(displayedUrl)
    ? displayedUrl
    : `https://${displayedUrl}`;

  const handleCopy = useCallback(async () => {
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopyState("success");
    } catch {
      setCopyState("failed");
    }

    // Transient indicator stays visible for at least 1 second
    timerRef.current = setTimeout(() => {
      setCopyState("idle");
      timerRef.current = null;
    }, 1500);
  }, [urlToCopy]);

  // SSL indicator rendering
  const sslContent = renderSslIndicator(sslIndicator);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4 text-muted-foreground" />
          Domain
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Domain / fallback URL display with copy action */}
        <div className="flex items-center justify-between gap-3">
          <p
            className="min-w-0 truncate font-mono text-sm text-foreground"
            data-testid="domain-display"
          >
            {displayedUrl}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy URL"
            data-testid="copy-action"
          >
            {copyState === "success" ? (
              <Check className="size-4 text-success-text" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>

        {/* Transient copy feedback */}
        {copyState === "success" && (
          <p
            className="text-xs text-success-text"
            data-testid="copy-success-indicator"
            role="status"
            aria-live="polite"
          >
            Copied to clipboard
          </p>
        )}
        {copyState === "failed" && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="copy-failed-indicator"
            role="status"
            aria-live="polite"
          >
            Could not copy to clipboard
          </p>
        )}

        {/* SSL indicator */}
        <div className="flex items-center gap-2" data-testid="ssl-indicator">
          {sslContent}
        </div>
      </CardContent>
    </Card>
  );
}

function renderSslIndicator(
  indicator: "Secured" | "Provisioning" | "Not_Configured"
) {
  switch (indicator) {
    case "Secured":
      return (
        <>
          <Lock className="size-4 text-success-text" />
          <span className="text-sm text-success-text font-medium">Secured</span>
        </>
      );
    case "Provisioning":
      return (
        <>
          <Loader2 className="size-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground font-medium">
            Provisioning
          </span>
        </>
      );
    case "Not_Configured":
      return (
        <>
          <Info className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-medium">
            Not Configured
          </span>
        </>
      );
  }
}
