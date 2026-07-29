import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SHIELD_ORDER, SHIELD_CATALOG, type Shield } from "@/lib/security/shield-catalog";
import type { ShieldState } from "@/lib/security";
import { ActiveBundleSection } from "../ActiveBundleSection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full Record<Shield, ShieldState> from a partial override map. */
function buildStates(
  overrides: Partial<Record<Shield, ShieldState>>,
  defaultState: ShieldState = "Locked"
): Record<Shield, ShieldState> {
  const states = {} as Record<Shield, ShieldState>;
  for (const s of SHIELD_ORDER) {
    states[s] = overrides[s] ?? defaultState;
  }
  return states;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Free plan, running — SSL_Shield and Runtime_Isolation active, rest locked */
const FREE_RUNNING = buildStates({
  SSL_Shield: "Active",
  Runtime_Isolation: "Active",
});

/** Starter plan, running — 4 shields active, rest locked */
const STARTER_RUNNING = buildStates({
  SSL_Shield: "Active",
  Runtime_Isolation: "Active",
  Firewall_Shield: "Active",
  Route_Guard: "Active",
});

/** Pro plan, deploying — 6 shields pending, rest locked */
const PRO_DEPLOYING = buildStates({
  SSL_Shield: "Pending",
  Runtime_Isolation: "Pending",
  Firewall_Shield: "Pending",
  Route_Guard: "Pending",
  Edge_Protection: "Pending",
  Traffic_Guard: "Pending",
});

/** Enterprise plan, running — all 9 shields active */
const ENTERPRISE_RUNNING = buildStates({}, "Active");

/** All shields locked (e.g. Free plan with no shields qualifying) */
const ALL_LOCKED = buildStates({}, "Locked");

/** Mixed: some active, some pending, some locked */
const MIXED_STATES = buildStates({
  Firewall_Shield: "Active",
  Route_Guard: "Active",
  Edge_Protection: "Pending",
  Runtime_Isolation: "Active",
  Traffic_Guard: "Pending",
  Threat_Shield: "Locked",
  DDoS_Guard: "Locked",
  SSL_Shield: "Active",
  Policy_Lock: "Locked",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActiveBundleSection", () => {
  // -------------------------------------------------------------------------
  // Requirement 6.1: tile sequence equals SHIELD_ORDER.filter(s => states[s] !== "Locked")
  // -------------------------------------------------------------------------
  describe("tile sequence matches SHIELD_ORDER filtered by non-Locked", () => {
    const fixtures: Array<{ name: string; states: Record<Shield, ShieldState> }> = [
      { name: "Free plan running", states: FREE_RUNNING },
      { name: "Starter plan running", states: STARTER_RUNNING },
      { name: "Pro plan deploying", states: PRO_DEPLOYING },
      { name: "Enterprise plan running", states: ENTERPRISE_RUNNING },
      { name: "Mixed states", states: MIXED_STATES },
    ];

    for (const { name, states } of fixtures) {
      it(`renders tiles in correct order for fixture: ${name}`, () => {
        render(<ActiveBundleSection states={states} />);

        const expectedShields = SHIELD_ORDER.filter((s) => states[s] !== "Locked");
        const expectedLabels = expectedShields.map(
          (s) => SHIELD_CATALOG[s].displayLabel
        );

        // Get all rendered display labels in document order
        const renderedLabels = expectedLabels
          .map((label) => screen.queryByText(label))
          .filter(Boolean);

        // All expected labels should be present
        expect(renderedLabels).toHaveLength(expectedLabels.length);

        // Verify order by checking that each label appears in the DOM
        // and that they appear in the correct sequence
        const allText = document.body.textContent ?? "";
        let lastIndex = -1;
        for (const label of expectedLabels) {
          const idx = allText.indexOf(label, lastIndex + 1);
          expect(idx).toBeGreaterThan(lastIndex);
          lastIndex = idx;
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 6.5: no Locked shield renders a tile in this section
  // -------------------------------------------------------------------------
  describe("no Locked shield renders a tile", () => {
    it("does not render tiles for Locked shields (Free plan)", () => {
      render(<ActiveBundleSection states={FREE_RUNNING} />);

      const lockedShields = SHIELD_ORDER.filter((s) => FREE_RUNNING[s] === "Locked");
      for (const shield of lockedShields) {
        expect(
          screen.queryByText(SHIELD_CATALOG[shield].displayLabel)
        ).not.toBeInTheDocument();
      }
    });

    it("does not render tiles for Locked shields (Mixed states)", () => {
      render(<ActiveBundleSection states={MIXED_STATES} />);

      const lockedShields = SHIELD_ORDER.filter((s) => MIXED_STATES[s] === "Locked");
      for (const shield of lockedShields) {
        expect(
          screen.queryByText(SHIELD_CATALOG[shield].displayLabel)
        ).not.toBeInTheDocument();
      }
    });

    it("does not render tiles for Locked shields (Starter plan)", () => {
      render(<ActiveBundleSection states={STARTER_RUNNING} />);

      const lockedShields = SHIELD_ORDER.filter(
        (s) => STARTER_RUNNING[s] === "Locked"
      );
      for (const shield of lockedShields) {
        expect(
          screen.queryByText(SHIELD_CATALOG[shield].displayLabel)
        ).not.toBeInTheDocument();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.7: empty-state message renders when every shield is Locked
  // -------------------------------------------------------------------------
  describe("empty-state message", () => {
    it('renders "No protections are active yet." when all shields are Locked', () => {
      render(<ActiveBundleSection states={ALL_LOCKED} />);

      expect(
        screen.getByText("No protections are active yet.")
      ).toBeInTheDocument();
    });

    it("does not render the empty-state message when at least one shield is non-Locked", () => {
      render(<ActiveBundleSection states={FREE_RUNNING} />);

      expect(
        screen.queryByText("No protections are active yet.")
      ).not.toBeInTheDocument();
    });

    it("does not render any shield tile when all shields are Locked", () => {
      render(<ActiveBundleSection states={ALL_LOCKED} />);

      // None of the shield display labels should appear
      for (const shield of SHIELD_ORDER) {
        expect(
          screen.queryByText(SHIELD_CATALOG[shield].displayLabel)
        ).not.toBeInTheDocument();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Additional: correct variant assignment (Active vs Pending)
  // -------------------------------------------------------------------------
  describe("variant assignment", () => {
    it('renders "Active" badge for shields with Active state', () => {
      render(<ActiveBundleSection states={FREE_RUNNING} />);

      // SSL_Shield and Runtime_Isolation are Active
      const activeBadges = screen.getAllByText("Active");
      expect(activeBadges.length).toBe(2);
    });

    it('renders "Pending" badge for shields with Pending state', () => {
      render(<ActiveBundleSection states={PRO_DEPLOYING} />);

      // All 6 bundle shields are Pending
      const pendingBadges = screen.getAllByText("Pending");
      expect(pendingBadges.length).toBe(6);
    });

    it("renders a mix of Active and Pending badges for mixed states", () => {
      render(<ActiveBundleSection states={MIXED_STATES} />);

      // Active: Firewall_Shield, Route_Guard, Runtime_Isolation, SSL_Shield = 4
      // Pending: Edge_Protection, Traffic_Guard = 2
      const activeBadges = screen.getAllByText("Active");
      const pendingBadges = screen.getAllByText("Pending");
      expect(activeBadges.length).toBe(4);
      expect(pendingBadges.length).toBe(2);
    });
  });
});
