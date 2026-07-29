/**
 * Pure security-state derivation functions.
 * No React imports, no I/O, no globals beyond const tables.
 *
 * Requirements: 3.1, 3.11, 4.1–4.7, 5.2–5.5, 8.3–8.7, 11.1–11.8, 14.3, 14.5
 * Design: Properties P1, P3–P7, P9
 */

import { SHIELDS, SHIELD_ORDER, type Shield } from "./shield-catalog";
import { PLAN_TIERS, PLAN_BUNDLES, lowestUnlockingTier, type PlanTier } from "./plan-bundle-map";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShieldState = "Active" | "Pending" | "Locked";

export type AppStatus = "pending" | "deploying" | "running" | "stopped" | "error";

export type SecurityStatus =
  | "At_Risk"
  | "Basic"
  | "Protected"
  | "Hardened"
  | "Fortified";

export interface PlanLikeInputs {
  /** Primary plan slug or name from /plans/current. */
  plan?: string | null | undefined;
  /** Optional context fields per Requirement 3.11. */
  subscriptionTier?: string | null | undefined;
  entitlement?: string | null | undefined;
  billingPlan?: string | null | undefined;
}

export interface DeriveShieldStatesInputs {
  tier: PlanTier | null;
  appStatus: AppStatus | null;
  domainConfigured: boolean;
  /** Reserved for future ssl-cert readback (TODO(ssl-cert-readback)). */
  sslPrerequisiteOverride?: boolean;
}

export interface NextStepInputs {
  appStatus: AppStatus | null;
  domainConfigured: boolean;
  tier: PlanTier | null;
  states: Record<Shield, ShieldState>;
}

export type NextStep =
  | { kind: "troubleshoot-error"; href: string }
  | { kind: "configure-domain"; href: string }
  | { kind: "upgrade-plan"; targetTier: PlanTier; href: string }
  | { kind: "all-protected" }
  | { kind: "no-action" };

// ─── derivePlanTier ──────────────────────────────────────────────────────────

/**
 * Normalized set of recognized tier labels (lowercase) for fast lookup.
 */
const RECOGNIZED_TIERS_LOWER = new Set(
  PLAN_TIERS.map((t) => t.toLowerCase())
);

/**
 * Map from lowercase tier label to the canonical PlanTier value.
 */
const TIER_LOOKUP: Record<string, PlanTier> = Object.fromEntries(
  PLAN_TIERS.map((t) => [t.toLowerCase(), t])
) as Record<string, PlanTier>;

/**
 * Normalizes a candidate value: String(value ?? "").trim().toLowerCase()
 */
function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Attempts to match a normalized string to a recognized PlanTier.
 * Returns the PlanTier if recognized, otherwise null.
 */
function matchTier(normalized: string): PlanTier | null {
  if (RECOGNIZED_TIERS_LOWER.has(normalized)) {
    return TIER_LOOKUP[normalized];
  }
  return null;
}

/**
 * Pure: matches Free/Starter/Pro/Business/Enterprise case-insensitively after trim;
 * falls back through subscriptionTier, entitlement, billingPlan;
 * defaults to "Free" if no field matches. Emits at most one warning per call
 * via the optional `onWarn` sink.
 *
 * Requirements: 3.1, 3.11, 14.3, 14.5
 * Design: Property P1
 */
export function derivePlanTier(
  inputs: PlanLikeInputs,
  onWarn?: (message: string) => void
): PlanTier {
  // 1. Try the primary `plan` field
  const planMatch = matchTier(normalize(inputs.plan));
  if (planMatch !== null) {
    return planMatch;
  }

  // 2. Fallback chain: subscriptionTier → entitlement → billingPlan
  const subscriptionMatch = matchTier(normalize(inputs.subscriptionTier));
  if (subscriptionMatch !== null) {
    return subscriptionMatch;
  }

  const entitlementMatch = matchTier(normalize(inputs.entitlement));
  if (entitlementMatch !== null) {
    return entitlementMatch;
  }

  const billingMatch = matchTier(normalize(inputs.billingPlan));
  if (billingMatch !== null) {
    return billingMatch;
  }

  // 3. Default to Free and invoke onWarn exactly once
  onWarn?.("plan defaulted to Free");
  return "Free";
}

// ─── deriveShieldStates ──────────────────────────────────────────────────────

/**
 * Pure: returns a complete map of shield states for all 9 recognized Shields.
 * Never throws. Iterates over SHIELDS to produce a deterministic, total result.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7
 * Design: Property P3, P9; conservative SSL prerequisite decision
 */
export function deriveShieldStates(
  inputs: DeriveShieldStatesInputs
): Record<Shield, ShieldState> {
  const { tier, appStatus, domainConfigured, sslPrerequisiteOverride } = inputs;

  const result = {} as Record<Shield, ShieldState>;

  // Req 4.7: If tier or appStatus cannot be determined, all shields are Pending
  if (tier === null || appStatus === null) {
    for (const shield of SHIELDS) {
      result[shield] = "Pending";
    }
    return result;
  }

  const bundle = PLAN_BUNDLES[tier];

  for (const shield of SHIELDS) {
    // Req 4.3: Shield not in the plan's bundle → Locked
    if (!bundle.has(shield)) {
      result[shield] = "Locked";
      continue;
    }

    // Req 4.4/4.5: Shield is in bundle but app is not running → Pending
    if (appStatus !== "running") {
      result[shield] = "Pending";
      continue;
    }

    // SSL_Shield has an additional prerequisite: domain must be configured
    // and the SSL certificate must be valid (conservative: treat as valid
    // when domain is configured, unless overridden by sslPrerequisiteOverride).
    // TODO(ssl-cert-readback): Replace conservative predicate with actual
    // certificate validity from `api.getAppDomains(appId).sslStatus` when available.
    if (shield === "SSL_Shield") {
      const sslPrereqMet = domainConfigured && (sslPrerequisiteOverride ?? true);
      if (!sslPrereqMet) {
        result[shield] = "Pending";
        continue;
      }
    }

    // Req 4.1: Shield is in bundle, app is running, prerequisites met → Active
    result[shield] = "Active";
  }

  return result;
}

// ─── computeSecurityScore ────────────────────────────────────────────────────

/**
 * Pure: computes the security score as round_half_up((activeCount / 9) * 100).
 * Implemented as Math.floor((activeCount * 100) / 9 + 0.5) to avoid floating-point issues.
 *
 * Requirements: 5.2, 5.3
 * Design: Property P4
 */
export function computeSecurityScore(states: Record<Shield, ShieldState>): number {
  let activeCount = 0;
  for (const shield of SHIELDS) {
    if (states[shield] === "Active") {
      activeCount++;
    }
  }
  return Math.floor((activeCount * 100) / 9 + 0.5);
}

// ─── deriveSecurityStatus ────────────────────────────────────────────────────

/**
 * Pure: maps an integer score in [0, 100] to one of the five SecurityStatus labels.
 * Inclusive bands: 0..39 → At_Risk, 40..59 → Basic, 60..79 → Protected,
 * 80..94 → Hardened, 95..100 → Fortified.
 *
 * Requirements: 5.4
 * Design: Property P5
 */
export function deriveSecurityStatus(score: number): SecurityStatus {
  if (score <= 39) return "At_Risk";
  if (score <= 59) return "Basic";
  if (score <= 79) return "Protected";
  if (score <= 94) return "Hardened";
  return "Fortified";
}

// ─── deriveSslIndicator ──────────────────────────────────────────────────────

/**
 * Pure: derives the SSL indicator using only domainConfigured and the SSL_Shield state.
 * Precedence: domainConfigured === false always returns "Not_Configured".
 *
 * Truth table:
 *   domainConfigured === false → "Not_Configured"
 *   domainConfigured === true && sslShieldState === "Active" → "Secured"
 *   domainConfigured === true && sslShieldState === "Pending" → "Provisioning"
 *   domainConfigured === true && sslShieldState === "Locked" → "Provisioning"
 *
 * Requirements: 8.3, 8.4, 8.5, 8.6, 8.7
 * Design: Property P6
 */
export function deriveSslIndicator(
  domainConfigured: boolean,
  sslShieldState: ShieldState
): "Secured" | "Provisioning" | "Not_Configured" {
  if (!domainConfigured) {
    return "Not_Configured";
  }
  if (sslShieldState === "Active") {
    return "Secured";
  }
  return "Provisioning";
}

// ─── SECURITY_STATUS_DESCRIPTIONS ────────────────────────────────────────────

/**
 * Predefined plain-language descriptions for each SecurityStatus value.
 * Each description is a single line of at most 120 characters with no unexpanded acronyms.
 *
 * Requirements: 5.5
 */
export const SECURITY_STATUS_DESCRIPTIONS: Readonly<Record<SecurityStatus, string>> = Object.freeze({
  At_Risk: "Your app has minimal protection enabled. Consider upgrading your plan to activate more security shields.",
  Basic: "Your app has basic protections in place. Additional shields are available to strengthen your security posture.",
  Protected: "Your app is well protected with multiple active shields covering key threat vectors.",
  Hardened: "Your app has strong security coverage with most shields active and protecting against common threats.",
  Fortified: "Your app has maximum protection with all available security shields active and fully operational.",
});

// ─── selectNextStep ──────────────────────────────────────────────────────────

/**
 * Pure: selects the single most important suggested next action using a fixed
 * priority order. Evaluated in order, first match wins:
 *
 * 1. appStatus === "error" → troubleshoot-error
 * 2. domainConfigured === false → configure-domain
 * 3. tier !== "Enterprise" and at least one shield is Locked → upgrade-plan
 * 4. appStatus === "running" and all shields are Active and domainConfigured → all-protected
 * 5. otherwise → no-action
 *
 * The "first locked in shield order" lookup iterates over SHIELD_ORDER (not
 * Object.keys) to keep the result deterministic.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 * Design: Property P7
 */
export function selectNextStep(inputs: NextStepInputs): NextStep {
  const { appStatus, domainConfigured, tier, states } = inputs;

  // Branch 1: App is in error state → suggest troubleshooting
  if (appStatus === "error") {
    return { kind: "troubleshoot-error", href: "/apps/[id]?settings=deployments" };
  }

  // Branch 2: No domain configured → suggest domain configuration
  if (domainConfigured === false) {
    return { kind: "configure-domain", href: "/apps/[id]?settings=domains" };
  }

  // Branch 3: Not Enterprise and at least one shield is Locked → suggest upgrade
  if (tier !== "Enterprise") {
    // Find the first locked shield in SHIELD_ORDER (deterministic iteration)
    let firstLockedShield: Shield | null = null;
    for (const shield of SHIELD_ORDER) {
      if (states[shield] === "Locked") {
        firstLockedShield = shield;
        break;
      }
    }

    if (firstLockedShield !== null) {
      return {
        kind: "upgrade-plan",
        targetTier: lowestUnlockingTier(firstLockedShield),
        href: "/settings?section=plan",
      };
    }
  }

  // Branch 4: Running, all shields Active, and domain configured → fully protected
  if (appStatus === "running" && domainConfigured) {
    const allActive = SHIELD_ORDER.every((s) => states[s] === "Active");
    if (allActive) {
      return { kind: "all-protected" };
    }
  }

  // Branch 5: No condition matched → no action required
  return { kind: "no-action" };
}
