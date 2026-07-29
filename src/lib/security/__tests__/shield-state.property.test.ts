/**
 * Property-based tests for the pure security-state derivation modules.
 * Uses fast-check with vitest.
 *
 * Requirements: 3.1, 3.3, 3.4, 3.11, 4.1–4.7, 5.2–5.4, 7.2, 7.7,
 *              8.3–8.7, 11.1–11.8, 12.1, 14.3, 14.5
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { SHIELDS, SHIELD_CATALOG, SHIELD_ORDER, type Shield } from "../shield-catalog";
import {
  PLAN_TIERS,
  PLAN_TIER_ORDER,
  PLAN_BUNDLES,
  bundleFor,
  lowestUnlockingTier,
  type PlanTier,
} from "../plan-bundle-map";
import {
  derivePlanTier,
  deriveShieldStates,
  computeSecurityScore,
  deriveSecurityStatus,
  deriveSslIndicator,
  selectNextStep,
  type ShieldState,
  type AppStatus,
  type PlanLikeInputs,
  type DeriveShieldStatesInputs,
  type NextStepInputs,
} from "../shield-state";

// ─── Shared Arbitraries ──────────────────────────────────────────────────────

const arbPlanTier: fc.Arbitrary<PlanTier> = fc.constantFrom(...PLAN_TIERS);

const arbAppStatus: fc.Arbitrary<AppStatus> = fc.constantFrom(
  "pending",
  "deploying",
  "running",
  "stopped",
  "error"
);

const arbShieldState: fc.Arbitrary<ShieldState> = fc.constantFrom(
  "Active",
  "Pending",
  "Locked"
);

const arbShield: fc.Arbitrary<Shield> = fc.constantFrom(...SHIELDS);

/** Generates a Record<Shield, ShieldState> with a random state for each shield. */
const arbShieldStatesRecord: fc.Arbitrary<Record<Shield, ShieldState>> = fc
  .tuple(...SHIELDS.map(() => arbShieldState))
  .map((states) => {
    const record = {} as Record<Shield, ShieldState>;
    SHIELDS.forEach((shield, i) => {
      record[shield] = states[i];
    });
    return record;
  });

/** Generates a whitespace string of length 0..3. */
const arbWhitespace: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n"), { minLength: 0, maxLength: 3 })
  .map((chars) => chars.join(""));

/** Generates a string that is a recognized tier with random whitespace/case. */
const arbRecognizedTierString: fc.Arbitrary<string> = fc
  .tuple(arbPlanTier, arbWhitespace, arbWhitespace, fc.boolean())
  .map(([tier, prefix, suffix, upper]) => {
    const cased = upper ? tier.toUpperCase() : tier.toLowerCase();
    return `${prefix}${cased}${suffix}`;
  });

/** Generates a string that does NOT match any recognized tier after normalization. */
const arbInvalidTierString: fc.Arbitrary<string> = fc
  .string({ minLength: 0, maxLength: 20 })
  .filter((s) => {
    const normalized = s.trim().toLowerCase();
    return !PLAN_TIERS.some((t) => t.toLowerCase() === normalized);
  });

// ─── Property P1: derivePlanTier defaults safely and prefers `plan` ──────────

describe("Property P1: derivePlanTier defaults safely and prefers plan", () => {
  // Feature: app-details-security-redesign, Property 1: derivePlanTier defaults safely and prefers `plan`

  it("(a) prefers `plan` when it normalizes to a recognized tier", () => {
    fc.assert(
      fc.property(
        arbRecognizedTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        (plan, sub, ent, bill) => {
          const result = derivePlanTier({
            plan,
            subscriptionTier: sub,
            entitlement: ent,
            billingPlan: bill,
          });
          const expected = plan.trim().toLowerCase();
          const matchedTier = PLAN_TIERS.find(
            (t) => t.toLowerCase() === expected
          );
          expect(result).toBe(matchedTier);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(b) falls through subscriptionTier → entitlement → billingPlan when plan is invalid", () => {
    fc.assert(
      fc.property(
        arbInvalidTierString,
        arbRecognizedTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        (plan, sub, ent, bill) => {
          const result = derivePlanTier({
            plan,
            subscriptionTier: sub,
            entitlement: ent,
            billingPlan: bill,
          });
          const expected = sub.trim().toLowerCase();
          const matchedTier = PLAN_TIERS.find(
            (t) => t.toLowerCase() === expected
          );
          expect(result).toBe(matchedTier);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(b) falls through to entitlement when plan and subscriptionTier are invalid", () => {
    fc.assert(
      fc.property(
        arbInvalidTierString,
        arbInvalidTierString,
        arbRecognizedTierString,
        arbInvalidTierString,
        (plan, sub, ent, bill) => {
          const result = derivePlanTier({
            plan,
            subscriptionTier: sub,
            entitlement: ent,
            billingPlan: bill,
          });
          const expected = ent.trim().toLowerCase();
          const matchedTier = PLAN_TIERS.find(
            (t) => t.toLowerCase() === expected
          );
          expect(result).toBe(matchedTier);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(b) falls through to billingPlan when plan, subscriptionTier, and entitlement are invalid", () => {
    fc.assert(
      fc.property(
        arbInvalidTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        arbRecognizedTierString,
        (plan, sub, ent, bill) => {
          const result = derivePlanTier({
            plan,
            subscriptionTier: sub,
            entitlement: ent,
            billingPlan: bill,
          });
          const expected = bill.trim().toLowerCase();
          const matchedTier = PLAN_TIERS.find(
            (t) => t.toLowerCase() === expected
          );
          expect(result).toBe(matchedTier);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(c) defaults to Free and onWarn is invoked at most once when no field matches", () => {
    fc.assert(
      fc.property(
        arbInvalidTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        arbInvalidTierString,
        (plan, sub, ent, bill) => {
          let warnCount = 0;
          const onWarn = () => {
            warnCount++;
          };
          const result = derivePlanTier(
            { plan, subscriptionTier: sub, entitlement: ent, billingPlan: bill },
            onWarn
          );
          expect(result).toBe("Free");
          expect(warnCount).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("always returns a value in PLAN_TIERS and never throws", () => {
    fc.assert(
      fc.property(
        fc.oneof(arbRecognizedTierString, arbInvalidTierString, fc.constant(null), fc.constant(undefined)),
        fc.oneof(arbRecognizedTierString, arbInvalidTierString, fc.constant(null), fc.constant(undefined)),
        fc.oneof(arbRecognizedTierString, arbInvalidTierString, fc.constant(null), fc.constant(undefined)),
        fc.oneof(arbRecognizedTierString, arbInvalidTierString, fc.constant(null), fc.constant(undefined)),
        (plan, sub, ent, bill) => {
          const result = derivePlanTier({
            plan: plan as string | null | undefined,
            subscriptionTier: sub as string | null | undefined,
            entitlement: ent as string | null | undefined,
            billingPlan: bill as string | null | undefined,
          });
          expect(PLAN_TIERS).toContain(result);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property P2: Plan bundles are monotonic and closed ──────────────────────

describe("Property P2: plan bundles are monotonic and closed", () => {
  // Feature: app-details-security-redesign, Property 2: plan bundles are monotonic and closed

  it("bundleFor(P_low) ⊆ bundleFor(P_high) whenever index(P_low) <= index(P_high)", () => {
    fc.assert(
      fc.property(arbPlanTier, arbPlanTier, (tierA, tierB) => {
        const indexA = PLAN_TIER_ORDER.indexOf(tierA);
        const indexB = PLAN_TIER_ORDER.indexOf(tierB);
        const [low, high] =
          indexA <= indexB ? [tierA, tierB] : [tierB, tierA];
        const bundleLow = bundleFor(low);
        const bundleHigh = bundleFor(high);
        for (const shield of bundleLow) {
          expect(bundleHigh.has(shield)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("bundleFor(T) ⊆ new Set(SHIELDS) for every T", () => {
    fc.assert(
      fc.property(arbPlanTier, (tier) => {
        const bundle = bundleFor(tier);
        const allShields = new Set<string>(SHIELDS);
        for (const shield of bundle) {
          expect(allShields.has(shield)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property P3: deriveShieldStates partitions all 9 Shields ────────────────

describe("Property P3: deriveShieldStates partitions all 9 Shields per plan and status", () => {
  // Feature: app-details-security-redesign, Property 3: deriveShieldStates partitions all 9 Shields per plan and status

  const arbTierOrNull: fc.Arbitrary<PlanTier | null> = fc.oneof(
    arbPlanTier,
    fc.constant(null)
  );
  const arbStatusOrNull: fc.Arbitrary<AppStatus | null> = fc.oneof(
    arbAppStatus,
    fc.constant(null)
  );

  it("(a) every value is one of Active, Pending, Locked", () => {
    fc.assert(
      fc.property(
        arbTierOrNull,
        arbStatusOrNull,
        fc.boolean(),
        (tier, appStatus, domainConfigured) => {
          const result = deriveShieldStates({ tier, appStatus, domainConfigured });
          for (const shield of SHIELDS) {
            expect(["Active", "Pending", "Locked"]).toContain(result[shield]);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(b) Locked iff not in bundleFor(tier) when tier is not null", () => {
    fc.assert(
      fc.property(
        arbPlanTier,
        arbAppStatus,
        fc.boolean(),
        (tier, appStatus, domainConfigured) => {
          const result = deriveShieldStates({ tier, appStatus, domainConfigured });
          const bundle = bundleFor(tier);
          for (const shield of SHIELDS) {
            if (!bundle.has(shield)) {
              expect(result[shield]).toBe("Locked");
            } else {
              expect(result[shield]).not.toBe("Locked");
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(c) Active implies shield is in bundle and appStatus is running", () => {
    fc.assert(
      fc.property(
        arbTierOrNull,
        arbStatusOrNull,
        fc.boolean(),
        (tier, appStatus, domainConfigured) => {
          const result = deriveShieldStates({ tier, appStatus, domainConfigured });
          for (const shield of SHIELDS) {
            if (result[shield] === "Active") {
              expect(tier).not.toBeNull();
              expect(appStatus).toBe("running");
              expect(bundleFor(tier!).has(shield)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(d) when appStatus is not running, no shield is Active", () => {
    fc.assert(
      fc.property(
        arbTierOrNull,
        fc.constantFrom("error", "stopped", "pending", "deploying") as fc.Arbitrary<AppStatus>,
        fc.boolean(),
        (tier, appStatus, domainConfigured) => {
          const result = deriveShieldStates({ tier, appStatus, domainConfigured });
          for (const shield of SHIELDS) {
            expect(result[shield]).not.toBe("Active");
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("(e) when tier is null or appStatus is null, every shield is Pending", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(fc.constant(null as PlanTier | null), arbStatusOrNull, fc.boolean()),
          fc.tuple(arbTierOrNull, fc.constant(null as AppStatus | null), fc.boolean())
        ),
        ([tier, appStatus, domainConfigured]) => {
          const result = deriveShieldStates({ tier, appStatus, domainConfigured });
          for (const shield of SHIELDS) {
            expect(result[shield]).toBe("Pending");
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property P4: computeSecurityScore is bounded and exact ──────────────────

describe("Property P4: computeSecurityScore is bounded and exact", () => {
  // Feature: app-details-security-redesign, Property 4: computeSecurityScore is bounded and exact

  it("score equals Math.floor((activeCount * 100) / 9 + 0.5) and is in [0, 100]", () => {
    fc.assert(
      fc.property(arbShieldStatesRecord, (states) => {
        const score = computeSecurityScore(states);
        let activeCount = 0;
        for (const shield of SHIELDS) {
          if (states[shield] === "Active") {
            activeCount++;
          }
        }
        const expected = Math.floor((activeCount * 100) / 9 + 0.5);
        expect(score).toBe(expected);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property P5: deriveSecurityStatus partitions [0,100] into five bands ────

describe("Property P5: deriveSecurityStatus partitions [0,100] into five exact bands", () => {
  // Feature: app-details-security-redesign, Property 5: deriveSecurityStatus partitions [0,100] into five exact bands

  it("maps each score to the correct band", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(0, 39, 40, 59, 60, 79, 80, 94, 95, 100),
          fc.integer({ min: 0, max: 100 })
        ),
        (score) => {
          const status = deriveSecurityStatus(score);
          if (score <= 39) {
            expect(status).toBe("At_Risk");
          } else if (score <= 59) {
            expect(status).toBe("Basic");
          } else if (score <= 79) {
            expect(status).toBe("Protected");
          } else if (score <= 94) {
            expect(status).toBe("Hardened");
          } else {
            expect(status).toBe("Fortified");
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property P6: deriveSslIndicator matches the truth table ─────────────────

describe("Property P6: deriveSslIndicator matches the truth table", () => {
  // Feature: app-details-security-redesign, Property 6: deriveSslIndicator matches the truth table

  it("returns the correct indicator for all (domainConfigured, sslState) combinations", () => {
    fc.assert(
      fc.property(fc.boolean(), arbShieldState, (domainConfigured, sslState) => {
        const result = deriveSslIndicator(domainConfigured, sslState);
        if (!domainConfigured) {
          expect(result).toBe("Not_Configured");
        } else if (sslState === "Active") {
          expect(result).toBe("Secured");
        } else {
          // Pending or Locked
          expect(result).toBe("Provisioning");
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property P7: selectNextStep honors the fixed priority order ─────────────

describe("Property P7: selectNextStep honors the fixed priority order", () => {
  // Feature: app-details-security-redesign, Property 7: selectNextStep honors the fixed priority order

  const arbNextStepInputs: fc.Arbitrary<NextStepInputs> = fc
    .tuple(
      fc.oneof(arbAppStatus, fc.constant(null as AppStatus | null)),
      fc.boolean(),
      fc.oneof(arbPlanTier, fc.constant(null as PlanTier | null)),
      arbShieldStatesRecord
    )
    .map(([appStatus, domainConfigured, tier, states]) => ({
      appStatus,
      domainConfigured,
      tier,
      states,
    }));

  it("returns the first matching branch in priority order", () => {
    fc.assert(
      fc.property(arbNextStepInputs, (inputs) => {
        const result = selectNextStep(inputs);
        const { appStatus, domainConfigured, tier, states } = inputs;

        // Branch 1: appStatus === "error" → troubleshoot-error
        if (appStatus === "error") {
          expect(result.kind).toBe("troubleshoot-error");
          return;
        }

        // Branch 2: domainConfigured === false → configure-domain
        if (!domainConfigured) {
          expect(result.kind).toBe("configure-domain");
          return;
        }

        // Branch 3: tier !== "Enterprise" and at least one Locked → upgrade-plan
        if (tier !== "Enterprise") {
          let firstLockedShield: Shield | null = null;
          for (const shield of SHIELD_ORDER) {
            if (states[shield] === "Locked") {
              firstLockedShield = shield;
              break;
            }
          }
          if (firstLockedShield !== null) {
            expect(result.kind).toBe("upgrade-plan");
            if (result.kind === "upgrade-plan") {
              expect(result.targetTier).toBe(
                lowestUnlockingTier(firstLockedShield)
              );
            }
            return;
          }
        }

        // Branch 4: running, all Active, domainConfigured → all-protected
        if (appStatus === "running" && domainConfigured) {
          const allActive = SHIELD_ORDER.every(
            (s) => states[s] === "Active"
          );
          if (allActive) {
            expect(result.kind).toBe("all-protected");
            return;
          }
        }

        // Branch 5: otherwise → no-action
        expect(result.kind).toBe("no-action");
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property P9: locked-iff-not-Enterprise ──────────────────────────────────

describe("Property P9: locked-iff-not-Enterprise", () => {
  // Feature: app-details-security-redesign, Property 9: locked-iff-not-Enterprise

  it("for each PlanTier T, at least one Locked iff T !== Enterprise", () => {
    fc.assert(
      fc.property(arbPlanTier, (tier) => {
        const states = deriveShieldStates({
          tier,
          appStatus: "running",
          domainConfigured: true,
        });
        const hasLocked = SHIELDS.some((s) => states[s] === "Locked");
        if (tier === "Enterprise") {
          expect(hasLocked).toBe(false);
        } else {
          expect(hasLocked).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property P11: shield helper text invariants ─────────────────────────────

describe("Property P11: shield helper text invariants", () => {
  // Feature: app-details-security-redesign, Property 11: shield helper text invariants

  const ACRONYM_BLOCKLIST = ["WAF", "TLS", "DDoS", "CDN", "DNS", "VPC", "IDS", "IPS"];

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasUnexpandedAcronym(text: string, acronym: string): boolean {
    if (!text.includes(acronym)) {
      return false;
    }
    // Acronym is considered expanded if it appears within parentheses
    const parenthesizedPattern = new RegExp(`\\(${escapeRegex(acronym)}\\)`);
    if (parenthesizedPattern.test(text)) {
      return false;
    }
    return true;
  }

  it("helperText.length <= 140, fits locked tile cap <= 120, and no unexpanded acronyms", () => {
    fc.assert(
      fc.property(arbShield, (shield) => {
        const descriptor = SHIELD_CATALOG[shield];
        const helperText = descriptor.helperText;

        // (a) helperText.length <= 140
        expect(helperText.length).toBeLessThanOrEqual(140);

        // (b) fits the per-tile cap of <= 120 for the locked tile
        expect(helperText.length).toBeLessThanOrEqual(120);

        // (c) no acronym from the blocklist without a parenthesized expansion
        for (const acronym of ACRONYM_BLOCKLIST) {
          expect(hasUnexpandedAcronym(helperText, acronym)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });
});
