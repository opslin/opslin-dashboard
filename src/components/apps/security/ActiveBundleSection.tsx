/**
 * ActiveBundleSection — renders one ShieldTile per shield whose state is
 * Active or Pending, in the canonical SHIELD_ORDER. Shows a neutral
 * empty-state message when no shields qualify.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 12.2
 * Design: Property P8
 */

import * as React from "react";

import { SHIELD_ORDER, type Shield } from "@/lib/security/shield-catalog";
import type { ShieldState } from "@/lib/security";
import { ShieldTile } from "./ShieldTile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveBundleSectionProps {
  states: Record<Shield, ShieldState>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SECTION_ID = "active-bundle-heading";

export function ActiveBundleSection({
  states,
}: ActiveBundleSectionProps): React.JSX.Element {
  const activeShields = SHIELD_ORDER.filter((s) => states[s] !== "Locked");

  return (
    <section aria-labelledby={SECTION_ID}>
      <h2
        id={SECTION_ID}
        className="mb-4 text-lg font-semibold text-foreground"
      >
        Active Protections
      </h2>

      {activeShields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No protections are active yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {activeShields.map((shield) => (
            <ShieldTile
              key={shield}
              shield={shield}
              variant={states[shield] === "Active" ? "active" : "pending"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
