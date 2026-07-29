/**
 * LockedBundleSection — renders one ShieldTile per Shield whose state is Locked,
 * in canonical SHIELD_ORDER. Returns null when no shield is Locked.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.3
 * Design: Properties P8, P9
 */

import * as React from "react";

import { SHIELD_ORDER, type Shield } from "@/lib/security/shield-catalog";
import { lowestUnlockingTier } from "@/lib/security/plan-bundle-map";
import type { ShieldState } from "@/lib/security/shield-state";
import { ShieldTile } from "./ShieldTile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LockedBundleSectionProps {
  states: Record<Shield, ShieldState>;
  onUpgrade: () => void;
  upgradeRouteRegistered: boolean;
}

// ---------------------------------------------------------------------------
// No-op handler used when the upgrade route is not registered
// ---------------------------------------------------------------------------

const noop = () => {};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LockedBundleSection({
  states,
  onUpgrade,
  upgradeRouteRegistered,
}: LockedBundleSectionProps): React.JSX.Element | null {
  const lockedShields = SHIELD_ORDER.filter((s) => states[s] === "Locked");

  // Requirement 7.7: render nothing when no shield is Locked
  if (lockedShields.length === 0) {
    return null;
  }

  const handleUpgrade = upgradeRouteRegistered ? onUpgrade : noop;

  return (
    <section aria-labelledby="locked-bundle-heading">
      <h2
        id="locked-bundle-heading"
        className="mb-4 text-base font-semibold text-foreground"
      >
        Available with upgrade
      </h2>
      <div className="flex flex-col gap-4">
        {lockedShields.map((shield) => (
          <ShieldTile
            key={shield}
            shield={shield}
            variant="locked"
            unlockingTier={lowestUnlockingTier(shield)}
            onUpgrade={handleUpgrade}
          />
        ))}
      </div>
    </section>
  );
}
