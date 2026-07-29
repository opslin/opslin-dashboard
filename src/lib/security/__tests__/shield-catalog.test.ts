import { describe, it, expect } from "vitest";
import {
  SHIELDS,
  SHIELD_CATALOG,
  type Shield,
} from "../shield-catalog";

/**
 * Vitest tests for shield-catalog.ts
 * Requirements: 3.4, 12.1
 */

describe("shield-catalog", () => {
  describe("SHIELD_CATALOG keys match SHIELDS exactly", () => {
    it("has exactly 9 entries", () => {
      expect(Object.keys(SHIELD_CATALOG)).toHaveLength(9);
    });

    it("keys equal SHIELDS as a set", () => {
      const catalogKeys = new Set(Object.keys(SHIELD_CATALOG));
      const shieldsSet = new Set<string>(SHIELDS);
      expect(catalogKeys).toEqual(shieldsSet);
    });

    it("keys match SHIELDS in length", () => {
      expect(Object.keys(SHIELD_CATALOG).length).toBe(SHIELDS.length);
    });
  });

  describe("displayLabel matches the glossary mapping in Requirements 3.4", () => {
    const expectedLabels: Record<Shield, string> = {
      Firewall_Shield: "Firewall Shield",
      Route_Guard: "Route Guard",
      Edge_Protection: "Edge Protection",
      Runtime_Isolation: "Runtime Isolation",
      Traffic_Guard: "Traffic Guard",
      Threat_Shield: "Threat Shield",
      DDoS_Guard: "DDoS Guard",
      SSL_Shield: "SSL Shield",
      Policy_Lock: "Policy Lock",
    };

    for (const shield of SHIELDS) {
      it(`${shield} has displayLabel "${expectedLabels[shield]}"`, () => {
        expect(SHIELD_CATALOG[shield].displayLabel).toBe(expectedLabels[shield]);
      });
    }
  });

  describe("helperText length <= 140 characters", () => {
    for (const shield of SHIELDS) {
      it(`${shield} helperText is at most 140 characters`, () => {
        expect(SHIELD_CATALOG[shield].helperText.length).toBeLessThanOrEqual(140);
      });
    }
  });

  describe("no unexpanded acronyms in helperText", () => {
    const blocklist = ["WAF", "TLS", "DDoS", "CDN", "DNS", "VPC", "IDS", "IPS"];

    /**
     * An acronym is considered "expanded" if it appears followed by a
     * parenthesized expansion in the same string, e.g. "DDoS" is fine
     * if the string also contains "(DDoS)" or "denial-of-service (DDoS)".
     *
     * More precisely: the acronym is allowed if it appears inside parentheses
     * somewhere in the string (indicating it IS the expansion reference),
     * or if a parenthesized explanation accompanies it.
     */
    function hasUnexpandedAcronym(text: string, acronym: string): boolean {
      // Check if the acronym appears in the text at all (case-sensitive for acronyms)
      if (!text.includes(acronym)) {
        return false;
      }
      // The acronym is considered expanded if it appears within parentheses
      // e.g. "Transport Layer Security (TLS)" or "denial-of-service (DDoS)"
      const parenthesizedPattern = new RegExp(`\\(${escapeRegex(acronym)}\\)`);
      if (parenthesizedPattern.test(text)) {
        return false; // Has a parenthesized expansion
      }
      return true; // Acronym present but no parenthesized expansion
    }

    function escapeRegex(str: string): string {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    for (const shield of SHIELDS) {
      it(`${shield} helperText has no unexpanded acronyms from the blocklist`, () => {
        const helperText = SHIELD_CATALOG[shield].helperText;
        for (const acronym of blocklist) {
          expect(
            hasUnexpandedAcronym(helperText, acronym)
          ).toBe(false);
        }
      });
    }
  });

  describe("priority values cover 1..9 exactly once", () => {
    it("all priorities are in range 1..9", () => {
      for (const shield of SHIELDS) {
        const priority = SHIELD_CATALOG[shield].priority;
        expect(priority).toBeGreaterThanOrEqual(1);
        expect(priority).toBeLessThanOrEqual(9);
      }
    });

    it("all priorities are unique (cover 1..9 exactly once)", () => {
      const priorities = SHIELDS.map((s) => SHIELD_CATALOG[s].priority);
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBe(9);
      // Verify it's exactly {1, 2, 3, 4, 5, 6, 7, 8, 9}
      const expected = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(uniquePriorities).toEqual(expected);
    });
  });
});
