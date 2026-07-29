import { describe, it, expect } from "vitest";
import {
  PLAN_TIERS,
  PLAN_TIER_ORDER,
  PLAN_BUNDLES,
  bundleFor,
  lowestUnlockingTier,
  isShieldRecognized,
  type PlanTier,
} from "../plan-bundle-map";
import { SHIELDS, type Shield } from "../shield-catalog";

/**
 * Vitest example + structural tests for plan-bundle-map.ts
 * Requirements: 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.3
 */

describe("plan-bundle-map", () => {
  describe("exact bundle contents per tier (5 example tests)", () => {
    it("Free bundle contains exactly SSL_Shield and Runtime_Isolation", () => {
      expect(PLAN_BUNDLES.Free).toEqual(
        new Set<Shield>(["SSL_Shield", "Runtime_Isolation"])
      );
    });

    it("Starter bundle contains exactly SSL_Shield, Runtime_Isolation, Firewall_Shield, Route_Guard", () => {
      expect(PLAN_BUNDLES.Starter).toEqual(
        new Set<Shield>(["SSL_Shield", "Runtime_Isolation", "Firewall_Shield", "Route_Guard"])
      );
    });

    it("Pro bundle contains exactly SSL_Shield, Runtime_Isolation, Firewall_Shield, Route_Guard, Edge_Protection, Traffic_Guard", () => {
      expect(PLAN_BUNDLES.Pro).toEqual(
        new Set<Shield>([
          "SSL_Shield",
          "Runtime_Isolation",
          "Firewall_Shield",
          "Route_Guard",
          "Edge_Protection",
          "Traffic_Guard",
        ])
      );
    });

    it("Business bundle contains exactly SSL_Shield, Runtime_Isolation, Firewall_Shield, Route_Guard, Edge_Protection, Traffic_Guard, Threat_Shield, DDoS_Guard", () => {
      expect(PLAN_BUNDLES.Business).toEqual(
        new Set<Shield>([
          "SSL_Shield",
          "Runtime_Isolation",
          "Firewall_Shield",
          "Route_Guard",
          "Edge_Protection",
          "Traffic_Guard",
          "Threat_Shield",
          "DDoS_Guard",
        ])
      );
    });

    it("Enterprise bundle contains all 9 shields", () => {
      expect(PLAN_BUNDLES.Enterprise).toEqual(
        new Set<Shield>([
          "SSL_Shield",
          "Runtime_Isolation",
          "Firewall_Shield",
          "Route_Guard",
          "Edge_Protection",
          "Traffic_Guard",
          "Threat_Shield",
          "DDoS_Guard",
          "Policy_Lock",
        ])
      );
    });
  });

  describe("closure: Enterprise equals new Set(SHIELDS)", () => {
    it("PLAN_BUNDLES.Enterprise equals new Set(SHIELDS)", () => {
      const allShields = new Set<Shield>(SHIELDS);
      expect(PLAN_BUNDLES.Enterprise).toEqual(allShields);
    });

    it("Enterprise bundle has exactly 9 shields", () => {
      expect(PLAN_BUNDLES.Enterprise.size).toBe(9);
    });
  });

  describe("monotonicity: each adjacent pair P_i ⊆ P_{i+1}", () => {
    for (let i = 0; i < PLAN_TIER_ORDER.length - 1; i++) {
      const lower = PLAN_TIER_ORDER[i];
      const higher = PLAN_TIER_ORDER[i + 1];

      it(`every shield in ${lower} is also in ${higher}`, () => {
        const lowerBundle = PLAN_BUNDLES[lower];
        const higherBundle = PLAN_BUNDLES[higher];

        for (const shield of lowerBundle) {
          expect(higherBundle.has(shield)).toBe(true);
        }
      });

      it(`${higher} is a strict superset of ${lower}`, () => {
        const lowerBundle = PLAN_BUNDLES[lower];
        const higherBundle = PLAN_BUNDLES[higher];

        expect(higherBundle.size).toBeGreaterThan(lowerBundle.size);
      });
    }
  });

  describe("lowestUnlockingTier returns the correct tier for each shield", () => {
    it("returns Free for SSL_Shield", () => {
      expect(lowestUnlockingTier("SSL_Shield")).toBe("Free");
    });

    it("returns Free for Runtime_Isolation", () => {
      expect(lowestUnlockingTier("Runtime_Isolation")).toBe("Free");
    });

    it("returns Starter for Firewall_Shield", () => {
      expect(lowestUnlockingTier("Firewall_Shield")).toBe("Starter");
    });

    it("returns Starter for Route_Guard", () => {
      expect(lowestUnlockingTier("Route_Guard")).toBe("Starter");
    });

    it("returns Pro for Edge_Protection", () => {
      expect(lowestUnlockingTier("Edge_Protection")).toBe("Pro");
    });

    it("returns Pro for Traffic_Guard", () => {
      expect(lowestUnlockingTier("Traffic_Guard")).toBe("Pro");
    });

    it("returns Business for Threat_Shield", () => {
      expect(lowestUnlockingTier("Threat_Shield")).toBe("Business");
    });

    it("returns Business for DDoS_Guard", () => {
      expect(lowestUnlockingTier("DDoS_Guard")).toBe("Business");
    });

    it("returns Enterprise for Policy_Lock", () => {
      expect(lowestUnlockingTier("Policy_Lock")).toBe("Enterprise");
    });
  });

  describe("isShieldRecognized", () => {
    describe("returns true for all nine canonical shield strings", () => {
      for (const shield of SHIELDS) {
        it(`recognizes "${shield}"`, () => {
          expect(isShieldRecognized(shield)).toBe(true);
        });
      }
    });

    describe("returns false for arbitrary/invalid strings", () => {
      const invalidValues = ["", "Firewall", "firewall_shield", "Foo", "SSL", "policy_lock", "SHIELDS", "Route Guard"];

      for (const value of invalidValues) {
        it(`rejects "${value}"`, () => {
          expect(isShieldRecognized(value)).toBe(false);
        });
      }
    });
  });

  describe("bundleFor returns the same set as PLAN_BUNDLES[tier]", () => {
    for (const tier of PLAN_TIERS) {
      it(`bundleFor("${tier}") equals PLAN_BUNDLES.${tier}`, () => {
        expect(bundleFor(tier)).toBe(PLAN_BUNDLES[tier]);
      });
    }
  });

  describe("structural invariants", () => {
    it("PLAN_TIERS has exactly 5 entries", () => {
      expect(PLAN_TIERS).toHaveLength(5);
    });

    it("PLAN_TIER_ORDER is the same reference as PLAN_TIERS", () => {
      expect(PLAN_TIER_ORDER).toBe(PLAN_TIERS);
    });

    it("PLAN_BUNDLES has exactly 5 keys matching PLAN_TIERS", () => {
      const keys = Object.keys(PLAN_BUNDLES);
      expect(keys).toHaveLength(5);
      expect(new Set(keys)).toEqual(new Set<string>(PLAN_TIERS));
    });
  });
});
