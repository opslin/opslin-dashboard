/**
 * Plan-to-bundle mapping — maps each Plan_Tier to its fixed Security_Bundle
 * (a ReadonlySet of Shields) and provides helpers for tier lookups.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.3
 * Design: supports Properties P2, P9
 */

import { SHIELDS, type Shield } from "./shield-catalog";

/**
 * The five recognized Plan_Tier values in strictly ascending order.
 * Free < Starter < Pro < Business < Enterprise.
 */
export const PLAN_TIERS = ["Free", "Starter", "Pro", "Business", "Enterprise"] as const;

/**
 * Union type of all recognized Plan_Tier values.
 */
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Plan tiers in ascending order. Alias of PLAN_TIERS for semantic clarity
 * in "lowest unlocking tier" computations.
 */
export const PLAN_TIER_ORDER: readonly PlanTier[] = PLAN_TIERS;

/**
 * Static, closed Plan_Tier-to-Security_Bundle mapping.
 * Each higher tier is a strict superset of the next lower tier's bundle.
 * Frozen at runtime to prevent accidental mutation.
 */
export const PLAN_BUNDLES: Readonly<Record<PlanTier, ReadonlySet<Shield>>> = Object.freeze({
  Free: new Set<Shield>(["SSL_Shield", "Runtime_Isolation"]),
  Starter: new Set<Shield>(["SSL_Shield", "Runtime_Isolation", "Firewall_Shield", "Route_Guard"]),
  Pro: new Set<Shield>([
    "SSL_Shield",
    "Runtime_Isolation",
    "Firewall_Shield",
    "Route_Guard",
    "Edge_Protection",
    "Traffic_Guard",
  ]),
  Business: new Set<Shield>([
    "SSL_Shield",
    "Runtime_Isolation",
    "Firewall_Shield",
    "Route_Guard",
    "Edge_Protection",
    "Traffic_Guard",
    "Threat_Shield",
    "DDoS_Guard",
  ]),
  Enterprise: new Set<Shield>([
    "SSL_Shield",
    "Runtime_Isolation",
    "Firewall_Shield",
    "Route_Guard",
    "Edge_Protection",
    "Traffic_Guard",
    "Threat_Shield",
    "DDoS_Guard",
    "Policy_Lock",
  ]),
});

/**
 * Returns the Security_Bundle for the given Plan_Tier.
 */
export function bundleFor(tier: PlanTier): ReadonlySet<Shield> {
  return PLAN_BUNDLES[tier];
}

/**
 * Returns the lowest Plan_Tier (minimum index in PLAN_TIER_ORDER) that
 * includes the given Shield in its Security_Bundle.
 *
 * Requirement 7.3: used by the Upgrade_Affordance to display
 * "Available in {Plan_Tier}".
 */
export function lowestUnlockingTier(shield: Shield): PlanTier {
  for (let i = 0; i < PLAN_TIERS.length; i++) {
    if (PLAN_BUNDLES[PLAN_TIERS[i]].has(shield)) {
      return PLAN_TIERS[i];
    }
  }
  // This branch is unreachable for valid Shield values because Enterprise
  // contains all nine shields. Defensive fallback for safety.
  return "Enterprise";
}

/**
 * Pure type guard that checks whether a string value is one of the nine
 * recognized Shield identifiers.
 *
 * Requirement 3.10: runtime safeguard against unrecognized values entering
 * the rendering pipeline.
 */
export function isShieldRecognized(value: string): value is Shield {
  return (SHIELDS as readonly string[]).includes(value);
}
