/**
 * ShieldTile — renders a single Shield as a card in one of three variants:
 * active, pending, or locked.
 *
 * Layout invariants:
 * - Identical card padding, border, icon size, label/helper-text typography
 *   across all three variants.
 * - Active variant: blue accent badge.
 * - Pending variant: neutral grey badge.
 * - Locked variant: greyed-out icon/text, upgrade affordance, no exclamation marks.
 *
 * Requirements: 6.2, 6.3, 6.4, 7.2, 7.3, 7.4, 7.5, 7.6, 12.1, 12.2, 12.3
 */

import * as React from "react";
import {
  Shield,
  Route,
  Globe,
  Box,
  Activity,
  ShieldAlert,
  ShieldOff,
  Lock,
  FileLock,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { SHIELD_CATALOG, type Shield as ShieldId } from "@/lib/security/shield-catalog";
import type { PlanTier } from "@/lib/security/plan-bundle-map";

// ---------------------------------------------------------------------------
// Icon lookup table: maps iconKey from SHIELD_CATALOG to lucide-react component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  shield: Shield,
  route: Route,
  globe: Globe,
  box: Box,
  activity: Activity,
  "shield-alert": ShieldAlert,
  "shield-off": ShieldOff,
  lock: Lock,
  "file-lock": FileLock,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShieldTileVariant = "active" | "pending" | "locked";

export interface ShieldTileProps {
  shield: ShieldId;
  variant: ShieldTileVariant;
  unlockingTier?: PlanTier; // required when variant === "locked"
  onUpgrade?: () => void; // required when variant === "locked"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShieldTile({
  shield,
  variant,
  unlockingTier,
  onUpgrade,
}: ShieldTileProps): React.JSX.Element {
  const descriptor = SHIELD_CATALOG[shield];
  const IconComponent = ICON_MAP[descriptor.iconKey] ?? Shield;

  const isLocked = variant === "locked";

  return (
    <Card className="flex flex-row items-start gap-3 p-4 py-4 shadow-none">
      {/* Icon — fixed 20px size across all variants */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <IconComponent
          className={isLocked ? "h-5 w-5 text-muted-foreground/50" : "h-5 w-5 text-foreground"}
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Label row with badge */}
        <div className="flex items-center gap-2">
          <span
            className={
              isLocked
                ? "text-sm font-medium text-muted-foreground"
                : "text-sm font-medium text-foreground"
            }
          >
            {descriptor.displayLabel}
          </span>

          {/* Badge — variant-specific */}
          {variant === "active" && (
            <span className="inline-flex items-center rounded-full bg-[var(--opslin-info-muted)] px-2 py-0.5 text-xs font-medium text-[var(--opslin-info-default)]">
              Active
            </span>
          )}
          {variant === "pending" && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Pending
            </span>
          )}
        </div>

        {/* Helper text */}
        <p
          className={
            isLocked
              ? "text-xs leading-relaxed text-muted-foreground/70"
              : "text-xs leading-relaxed text-muted-foreground"
          }
        >
          {descriptor.helperText}
        </p>

        {/* Upgrade affordance — locked variant only */}
        {isLocked && unlockingTier && (
          <button
            type="button"
            className="mt-1 inline-flex w-fit items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onUpgrade}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onUpgrade?.();
              }
            }}
          >
            Available in {unlockingTier}
          </button>
        )}
      </div>
    </Card>
  );
}
