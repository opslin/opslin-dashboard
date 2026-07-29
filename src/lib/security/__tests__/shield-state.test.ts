import { describe, it, expect, vi } from "vitest";
import {
  derivePlanTier,
  deriveShieldStates,
  computeSecurityScore,
  deriveSecurityStatus,
  deriveSslIndicator,
  selectNextStep,
  SECURITY_STATUS_DESCRIPTIONS,
  type ShieldState,
  type AppStatus,
  type SecurityStatus,
  type PlanLikeInputs,
  type NextStepInputs,
} from "../shield-state";
import { SHIELDS, type Shield } from "../shield-catalog";
import { type PlanTier } from "../plan-bundle-map";

/**
 * Vitest example tests for shield-state.ts
 * Requirements: 3.1, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 5.2, 5.3, 5.4, 5.5,
 *               8.3, 8.4, 8.5, 8.6, 8.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8
 */

// ─── Helper to build a full shield states record ─────────────────────────────

function makeStates(overrides: Partial<Record<Shield, ShieldState>> = {}): Record<Shield, ShieldState> {
  const base: Record<Shield, ShieldState> = {} as Record<Shield, ShieldState>;
  for (const s of SHIELDS) {
    base[s] = "Locked";
  }
  return { ...base, ...overrides };
}

// ─── derivePlanTier ──────────────────────────────────────────────────────────

describe("derivePlanTier", () => {
  it('normalizes "  pro " (whitespace + mixed case) to Pro', () => {
    expect(derivePlanTier({ plan: "  pro " })).toBe("Pro");
  });

  it('normalizes "FREE" (uppercase) to Free', () => {
    expect(derivePlanTier({ plan: "FREE" })).toBe("Free");
  });

  it('falls back to subscriptionTier when plan is missing: subscriptionTier "Business" → Business', () => {
    expect(derivePlanTier({ subscriptionTier: "Business" })).toBe("Business");
  });

  it("defaults to Free and calls onWarn exactly once when all fields are empty", () => {
    const onWarn = vi.fn();
    const result = derivePlanTier({}, onWarn);

    expect(result).toBe("Free");
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledWith("plan defaulted to Free");
  });

  it("prefers plan over subscriptionTier when both are valid", () => {
    expect(derivePlanTier({ plan: "Starter", subscriptionTier: "Enterprise" })).toBe("Starter");
  });

  it("falls through subscriptionTier → entitlement → billingPlan in order", () => {
    expect(derivePlanTier({ plan: "invalid", entitlement: "Pro" })).toBe("Pro");
    expect(derivePlanTier({ plan: "invalid", billingPlan: "Enterprise" })).toBe("Enterprise");
  });

  it("does not call onWarn when a valid tier is found", () => {
    const onWarn = vi.fn();
    derivePlanTier({ plan: "Starter" }, onWarn);
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("handles null and undefined plan fields gracefully", () => {
    const onWarn = vi.fn();
    const result = derivePlanTier({ plan: null, subscriptionTier: undefined, entitlement: null, billingPlan: undefined }, onWarn);
    expect(result).toBe("Free");
    expect(onWarn).toHaveBeenCalledTimes(1);
  });
});

// ─── deriveShieldStates ──────────────────────────────────────────────────────

describe("deriveShieldStates", () => {
  it("tier=Free, status=running, domain=true → SSL_Shield and Runtime_Isolation are Active, other seven are Locked", () => {
    const states = deriveShieldStates({
      tier: "Free",
      appStatus: "running",
      domainConfigured: true,
    });

    expect(states.SSL_Shield).toBe("Active");
    expect(states.Runtime_Isolation).toBe("Active");

    // The other 7 shields should be Locked (not in Free bundle)
    expect(states.Firewall_Shield).toBe("Locked");
    expect(states.Route_Guard).toBe("Locked");
    expect(states.Edge_Protection).toBe("Locked");
    expect(states.Traffic_Guard).toBe("Locked");
    expect(states.Threat_Shield).toBe("Locked");
    expect(states.DDoS_Guard).toBe("Locked");
    expect(states.Policy_Lock).toBe("Locked");
  });

  it("tier=Free, status=stopped → all bundle shields are Pending, others Locked", () => {
    const states = deriveShieldStates({
      tier: "Free",
      appStatus: "stopped",
      domainConfigured: true,
    });

    // Free bundle shields should be Pending (app not running)
    expect(states.SSL_Shield).toBe("Pending");
    expect(states.Runtime_Isolation).toBe("Pending");

    // Non-bundle shields should be Locked
    expect(states.Firewall_Shield).toBe("Locked");
    expect(states.Route_Guard).toBe("Locked");
    expect(states.Edge_Protection).toBe("Locked");
    expect(states.Traffic_Guard).toBe("Locked");
    expect(states.Threat_Shield).toBe("Locked");
    expect(states.DDoS_Guard).toBe("Locked");
    expect(states.Policy_Lock).toBe("Locked");
  });

  it("tier=null → all 9 shields are Pending", () => {
    const states = deriveShieldStates({
      tier: null,
      appStatus: "running",
      domainConfigured: true,
    });

    for (const shield of SHIELDS) {
      expect(states[shield]).toBe("Pending");
    }
  });

  it("appStatus=null → all 9 shields are Pending", () => {
    const states = deriveShieldStates({
      tier: "Enterprise",
      appStatus: null,
      domainConfigured: true,
    });

    for (const shield of SHIELDS) {
      expect(states[shield]).toBe("Pending");
    }
  });

  it("tier=Enterprise, status=running, domain=true → all 9 shields are Active", () => {
    const states = deriveShieldStates({
      tier: "Enterprise",
      appStatus: "running",
      domainConfigured: true,
    });

    for (const shield of SHIELDS) {
      expect(states[shield]).toBe("Active");
    }
  });

  it("SSL_Shield is Pending when domain is not configured even if running", () => {
    const states = deriveShieldStates({
      tier: "Free",
      appStatus: "running",
      domainConfigured: false,
    });

    expect(states.SSL_Shield).toBe("Pending");
    expect(states.Runtime_Isolation).toBe("Active");
  });

  it("respects sslPrerequisiteOverride=false to force SSL_Shield to Pending", () => {
    const states = deriveShieldStates({
      tier: "Free",
      appStatus: "running",
      domainConfigured: true,
      sslPrerequisiteOverride: false,
    });

    expect(states.SSL_Shield).toBe("Pending");
    expect(states.Runtime_Isolation).toBe("Active");
  });

  it("always returns a complete map with all 9 shields", () => {
    const states = deriveShieldStates({
      tier: "Pro",
      appStatus: "deploying",
      domainConfigured: false,
    });

    expect(Object.keys(states)).toHaveLength(9);
    for (const shield of SHIELDS) {
      expect(states[shield]).toBeDefined();
    }
  });
});

// ─── computeSecurityScore and deriveSecurityStatus ───────────────────────────

describe("computeSecurityScore", () => {
  it("returns 0 when no shields are Active", () => {
    const states = makeStates(); // all Locked
    expect(computeSecurityScore(states)).toBe(0);
  });

  it("returns 11 when 1 shield is Active (round_half_up(100/9) = 11)", () => {
    const states = makeStates({ SSL_Shield: "Active" });
    expect(computeSecurityScore(states)).toBe(11);
  });

  it("returns 22 when 2 shields are Active (round_half_up(200/9) = 22)", () => {
    const states = makeStates({ SSL_Shield: "Active", Runtime_Isolation: "Active" });
    expect(computeSecurityScore(states)).toBe(22);
  });

  it("returns 100 when all 9 shields are Active", () => {
    const allActive: Record<Shield, ShieldState> = {} as Record<Shield, ShieldState>;
    for (const s of SHIELDS) {
      allActive[s] = "Active";
    }
    expect(computeSecurityScore(allActive)).toBe(100);
  });

  it("does not count Pending shields as Active", () => {
    const states = makeStates({ SSL_Shield: "Pending", Runtime_Isolation: "Pending" });
    expect(computeSecurityScore(states)).toBe(0);
  });

  it("computes correctly for intermediate counts", () => {
    // 4 active: round_half_up(400/9) = round_half_up(44.44...) = 44
    const states = makeStates({
      SSL_Shield: "Active",
      Runtime_Isolation: "Active",
      Firewall_Shield: "Active",
      Route_Guard: "Active",
    });
    expect(computeSecurityScore(states)).toBe(44);
  });
});

describe("deriveSecurityStatus", () => {
  describe("boundary tests for score bands", () => {
    it("score 0 → At_Risk", () => {
      expect(deriveSecurityStatus(0)).toBe("At_Risk");
    });

    it("score 39 → At_Risk (upper boundary)", () => {
      expect(deriveSecurityStatus(39)).toBe("At_Risk");
    });

    it("score 40 → Basic (lower boundary)", () => {
      expect(deriveSecurityStatus(40)).toBe("Basic");
    });

    it("score 59 → Basic (upper boundary)", () => {
      expect(deriveSecurityStatus(59)).toBe("Basic");
    });

    it("score 60 → Protected (lower boundary)", () => {
      expect(deriveSecurityStatus(60)).toBe("Protected");
    });

    it("score 79 → Protected (upper boundary)", () => {
      expect(deriveSecurityStatus(79)).toBe("Protected");
    });

    it("score 80 → Hardened (lower boundary)", () => {
      expect(deriveSecurityStatus(80)).toBe("Hardened");
    });

    it("score 94 → Hardened (upper boundary)", () => {
      expect(deriveSecurityStatus(94)).toBe("Hardened");
    });

    it("score 95 → Fortified (lower boundary)", () => {
      expect(deriveSecurityStatus(95)).toBe("Fortified");
    });

    it("score 100 → Fortified (upper boundary)", () => {
      expect(deriveSecurityStatus(100)).toBe("Fortified");
    });
  });
});

describe("SECURITY_STATUS_DESCRIPTIONS", () => {
  it("has a description for each SecurityStatus", () => {
    const statuses: SecurityStatus[] = ["At_Risk", "Basic", "Protected", "Hardened", "Fortified"];
    for (const status of statuses) {
      expect(SECURITY_STATUS_DESCRIPTIONS[status]).toBeDefined();
      expect(typeof SECURITY_STATUS_DESCRIPTIONS[status]).toBe("string");
    }
  });

  it("each description is at most 120 characters", () => {
    for (const [, desc] of Object.entries(SECURITY_STATUS_DESCRIPTIONS)) {
      expect(desc.length).toBeLessThanOrEqual(120);
    }
  });
});

// ─── deriveSslIndicator ──────────────────────────────────────────────────────

describe("deriveSslIndicator", () => {
  describe("truth table: all (domainConfigured, sslState) combinations", () => {
    it("domainConfigured=false, sslState=Active → Not_Configured", () => {
      expect(deriveSslIndicator(false, "Active")).toBe("Not_Configured");
    });

    it("domainConfigured=false, sslState=Pending → Not_Configured", () => {
      expect(deriveSslIndicator(false, "Pending")).toBe("Not_Configured");
    });

    it("domainConfigured=false, sslState=Locked → Not_Configured", () => {
      expect(deriveSslIndicator(false, "Locked")).toBe("Not_Configured");
    });

    it("domainConfigured=true, sslState=Active → Secured", () => {
      expect(deriveSslIndicator(true, "Active")).toBe("Secured");
    });

    it("domainConfigured=true, sslState=Pending → Provisioning", () => {
      expect(deriveSslIndicator(true, "Pending")).toBe("Provisioning");
    });

    it("domainConfigured=true, sslState=Locked → Provisioning", () => {
      expect(deriveSslIndicator(true, "Locked")).toBe("Provisioning");
    });
  });
});

// ─── selectNextStep ──────────────────────────────────────────────────────────

describe("selectNextStep", () => {
  // Helper: all shields Active (Enterprise + running + domain)
  function allActiveStates(): Record<Shield, ShieldState> {
    const states = {} as Record<Shield, ShieldState>;
    for (const s of SHIELDS) {
      states[s] = "Active";
    }
    return states;
  }

  // Helper: Free tier running with domain → SSL_Shield and Runtime_Isolation Active, rest Locked
  function freeRunningStates(): Record<Shield, ShieldState> {
    return deriveShieldStates({ tier: "Free", appStatus: "running", domainConfigured: true });
  }

  describe("branch 1: appStatus=error → troubleshoot-error", () => {
    it("returns troubleshoot-error when appStatus is error", () => {
      const result = selectNextStep({
        appStatus: "error",
        domainConfigured: true,
        tier: "Enterprise",
        states: allActiveStates(),
      });

      expect(result).toEqual({
        kind: "troubleshoot-error",
        href: "/apps/[id]?settings=deployments",
      });
    });

    it("error takes priority over missing domain", () => {
      const result = selectNextStep({
        appStatus: "error",
        domainConfigured: false,
        tier: "Free",
        states: freeRunningStates(),
      });

      expect(result.kind).toBe("troubleshoot-error");
    });
  });

  describe("branch 2: domainConfigured=false → configure-domain", () => {
    it("returns configure-domain when domain is not configured and app is not in error", () => {
      const result = selectNextStep({
        appStatus: "running",
        domainConfigured: false,
        tier: "Enterprise",
        states: allActiveStates(),
      });

      expect(result).toEqual({
        kind: "configure-domain",
        href: "/apps/[id]?settings=domains",
      });
    });
  });

  describe("branch 3: tier < Enterprise and at least one Locked shield → upgrade-plan", () => {
    it("returns upgrade-plan with the correct targetTier for Free tier", () => {
      const states = freeRunningStates();
      const result = selectNextStep({
        appStatus: "running",
        domainConfigured: true,
        tier: "Free",
        states,
      });

      expect(result).toEqual({
        kind: "upgrade-plan",
        targetTier: "Starter",
        href: "/settings?section=plan",
      });
    });

    it("targetTier is the lowest tier that unlocks the first locked shield in SHIELD_ORDER", () => {
      // For Free tier, the first locked shield in SHIELD_ORDER is Firewall_Shield
      // which is unlocked at Starter
      const states = freeRunningStates();
      const result = selectNextStep({
        appStatus: "running",
        domainConfigured: true,
        tier: "Free",
        states,
      });

      expect(result.kind).toBe("upgrade-plan");
      if (result.kind === "upgrade-plan") {
        expect(result.targetTier).toBe("Starter");
      }
    });
  });

  describe("branch 4: all shields Active, running, domain configured → all-protected", () => {
    it("returns all-protected when Enterprise, running, domain configured, all Active", () => {
      const result = selectNextStep({
        appStatus: "running",
        domainConfigured: true,
        tier: "Enterprise",
        states: allActiveStates(),
      });

      expect(result).toEqual({ kind: "all-protected" });
    });
  });

  describe("branch 5: no condition matched → no-action", () => {
    it("returns no-action when app is deploying with Enterprise tier and domain configured", () => {
      // Enterprise + deploying + domain configured: no error, domain is configured,
      // no locked shields (Enterprise), but not all Active (deploying → Pending), not running
      const states = deriveShieldStates({
        tier: "Enterprise",
        appStatus: "deploying",
        domainConfigured: true,
      });

      const result = selectNextStep({
        appStatus: "deploying",
        domainConfigured: true,
        tier: "Enterprise",
        states,
      });

      expect(result).toEqual({ kind: "no-action" });
    });

    it("returns no-action when app is stopped with Enterprise tier and domain configured", () => {
      const states = deriveShieldStates({
        tier: "Enterprise",
        appStatus: "stopped",
        domainConfigured: true,
      });

      const result = selectNextStep({
        appStatus: "stopped",
        domainConfigured: true,
        tier: "Enterprise",
        states,
      });

      expect(result).toEqual({ kind: "no-action" });
    });
  });
});
