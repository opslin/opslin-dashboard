import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SHIELD_ORDER, SHIELD_CATALOG, type Shield } from "@/lib/security/shield-catalog";
import { lowestUnlockingTier } from "@/lib/security/plan-bundle-map";
import type { ShieldState } from "@/lib/security/shield-state";
import { LockedBundleSection } from "../LockedBundleSection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full states record from a partial map (defaults to "Active"). */
function buildStates(
  overrides: Partial<Record<Shield, ShieldState>> = {}
): Record<Shield, ShieldState> {
  const base: Record<Shield, ShieldState> = {} as Record<Shield, ShieldState>;
  for (const s of SHIELD_ORDER) {
    base[s] = overrides[s] ?? "Active";
  }
  return base;
}

/** Collect all classNames from a container's DOM tree. */
function collectAllClassNames(container: HTMLElement): string {
  const elements = container.querySelectorAll("*");
  let allClasses = "";
  elements.forEach((el) => {
    if (el.className && typeof el.className === "string") {
      allClasses += " " + el.className;
    }
  });
  return allClasses;
}

/** Collect all text content from a container. */
function collectAllText(container: HTMLElement): string {
  return container.textContent ?? "";
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Free plan: SSL_Shield and Runtime_Isolation are Active, rest are Locked. */
const FREE_RUNNING_STATES = buildStates({
  SSL_Shield: "Active",
  Runtime_Isolation: "Active",
  Firewall_Shield: "Locked",
  Route_Guard: "Locked",
  Edge_Protection: "Locked",
  Traffic_Guard: "Locked",
  Threat_Shield: "Locked",
  DDoS_Guard: "Locked",
  Policy_Lock: "Locked",
});

/** Enterprise plan: all shields Active, none Locked. */
const ENTERPRISE_RUNNING_STATES = buildStates();

/** Pro plan: 6 Active, 3 Locked. */
const PRO_RUNNING_STATES = buildStates({
  SSL_Shield: "Active",
  Runtime_Isolation: "Active",
  Firewall_Shield: "Active",
  Route_Guard: "Active",
  Edge_Protection: "Active",
  Traffic_Guard: "Active",
  Threat_Shield: "Locked",
  DDoS_Guard: "Locked",
  Policy_Lock: "Locked",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LockedBundleSection", () => {
  // -------------------------------------------------------------------------
  // Requirement 7.1: tile sequence equals SHIELD_ORDER.filter(s => states[s] === "Locked")
  // -------------------------------------------------------------------------
  describe("tile sequence matches SHIELD_ORDER filtered by Locked", () => {
    it("renders locked shields in canonical SHIELD_ORDER for Free plan", () => {
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const expectedOrder = SHIELD_ORDER.filter(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      );

      // Get all tile labels in order
      const labels = expectedOrder.map(
        (s) => SHIELD_CATALOG[s].displayLabel
      );

      const renderedLabels = labels.map((label) => screen.getByText(label));
      // Verify order by checking DOM positions
      for (let i = 0; i < renderedLabels.length - 1; i++) {
        const pos = renderedLabels[i].compareDocumentPosition(renderedLabels[i + 1]);
        // Node.DOCUMENT_POSITION_FOLLOWING === 4
        expect(pos & 4).toBe(4);
      }
    });

    it("renders locked shields in canonical SHIELD_ORDER for Pro plan", () => {
      render(
        <LockedBundleSection
          states={PRO_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const expectedOrder = SHIELD_ORDER.filter(
        (s) => PRO_RUNNING_STATES[s] === "Locked"
      );

      // Verify exactly these shields are rendered
      for (const shield of expectedOrder) {
        expect(
          screen.getByText(SHIELD_CATALOG[shield].displayLabel)
        ).toBeInTheDocument();
      }

      // Verify non-locked shields are NOT rendered
      const nonLocked = SHIELD_ORDER.filter(
        (s) => PRO_RUNNING_STATES[s] !== "Locked"
      );
      for (const shield of nonLocked) {
        expect(
          screen.queryByText(SHIELD_CATALOG[shield].displayLabel)
        ).not.toBeInTheDocument();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 7.7: returns null when no shield is Locked
  // -------------------------------------------------------------------------
  describe("returns null when no shield is Locked", () => {
    it("renders nothing for Enterprise plan (all shields Active)", () => {
      const { container } = render(
        <LockedBundleSection
          states={ENTERPRISE_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing when all shields are Pending (none Locked)", () => {
      const allPending = buildStates(
        Object.fromEntries(SHIELD_ORDER.map((s) => [s, "Pending" as ShieldState]))
      );
      const { container } = render(
        <LockedBundleSection
          states={allPending}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );
      expect(container.innerHTML).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 7.3: upgrade affordance label is "Available in {lowestUnlockingTier(shield)}"
  // -------------------------------------------------------------------------
  describe("upgrade affordance label", () => {
    it("displays 'Available in {lowestUnlockingTier(shield)}' for each locked shield", () => {
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const lockedShields = SHIELD_ORDER.filter(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      );

      // Collect all upgrade buttons
      const buttons = screen.getAllByRole("button");

      // Each locked shield should have a corresponding button with the correct tier
      expect(buttons).toHaveLength(lockedShields.length);
      for (let i = 0; i < lockedShields.length; i++) {
        const expectedTier = lowestUnlockingTier(lockedShields[i]);
        expect(buttons[i]).toHaveTextContent(`Available in ${expectedTier}`);
      }
    });

    it("shows correct tier for Pro-locked shields (Threat_Shield → Business, DDoS_Guard → Business, Policy_Lock → Enterprise)", () => {
      render(
        <LockedBundleSection
          states={PRO_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const lockedShields = SHIELD_ORDER.filter(
        (s) => PRO_RUNNING_STATES[s] === "Locked"
      );

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(lockedShields.length);

      // Threat_Shield and DDoS_Guard → Business, Policy_Lock → Enterprise
      expect(buttons[0]).toHaveTextContent("Available in Business");
      expect(buttons[1]).toHaveTextContent("Available in Business");
      expect(buttons[2]).toHaveTextContent("Available in Enterprise");
    });
  });

  // -------------------------------------------------------------------------
  // Requirements 7.4, 7.5: activation invokes onUpgrade only when upgradeRouteRegistered === true
  // -------------------------------------------------------------------------
  describe("onUpgrade activation gated by upgradeRouteRegistered", () => {
    it("invokes onUpgrade on click when upgradeRouteRegistered is true", () => {
      const onUpgrade = vi.fn();
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={onUpgrade}
          upgradeRouteRegistered={true}
        />
      );

      const firstLockedShield = SHIELD_ORDER.find(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      )!;
      const tier = lowestUnlockingTier(firstLockedShield);
      const button = screen.getAllByRole("button", {
        name: new RegExp(`Available in ${tier}`),
      })[0];

      fireEvent.click(button);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it("invokes onUpgrade on Enter key when upgradeRouteRegistered is true", () => {
      const onUpgrade = vi.fn();
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={onUpgrade}
          upgradeRouteRegistered={true}
        />
      );

      const firstLockedShield = SHIELD_ORDER.find(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      )!;
      const tier = lowestUnlockingTier(firstLockedShield);
      const button = screen.getAllByRole("button", {
        name: new RegExp(`Available in ${tier}`),
      })[0];

      fireEvent.keyDown(button, { key: "Enter" });
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it("invokes onUpgrade on Space key when upgradeRouteRegistered is true", () => {
      const onUpgrade = vi.fn();
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={onUpgrade}
          upgradeRouteRegistered={true}
        />
      );

      const firstLockedShield = SHIELD_ORDER.find(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      )!;
      const tier = lowestUnlockingTier(firstLockedShield);
      const button = screen.getAllByRole("button", {
        name: new RegExp(`Available in ${tier}`),
      })[0];

      fireEvent.keyDown(button, { key: " " });
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it("does NOT invoke onUpgrade when upgradeRouteRegistered is false", () => {
      const onUpgrade = vi.fn();
      render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={onUpgrade}
          upgradeRouteRegistered={false}
        />
      );

      const firstLockedShield = SHIELD_ORDER.find(
        (s) => FREE_RUNNING_STATES[s] === "Locked"
      )!;
      const tier = lowestUnlockingTier(firstLockedShield);
      const button = screen.getAllByRole("button", {
        name: new RegExp(`Available in ${tier}`),
      })[0];

      fireEvent.click(button);
      fireEvent.keyDown(button, { key: "Enter" });
      fireEvent.keyDown(button, { key: " " });
      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Requirements 7.6, 12.3: no red/orange/yellow/amber class tokens, no "!" in text
  // -------------------------------------------------------------------------
  describe("color and text constraints", () => {
    it("has no className tokens matching red/orange/yellow/amber pattern", () => {
      const { container } = render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const allClasses = collectAllClassNames(container);
      const forbiddenPattern = /(?:^|\s|-)(red|orange|yellow|amber)-\d+/;
      expect(forbiddenPattern.test(allClasses)).toBe(false);
    });

    it('has no "!" characters in any tile text', () => {
      const { container } = render(
        <LockedBundleSection
          states={FREE_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const allText = collectAllText(container);
      expect(allText).not.toContain("!");
    });

    it("maintains color constraints with Pro plan locked shields", () => {
      const { container } = render(
        <LockedBundleSection
          states={PRO_RUNNING_STATES}
          onUpgrade={vi.fn()}
          upgradeRouteRegistered={true}
        />
      );

      const allClasses = collectAllClassNames(container);
      const forbiddenPattern = /(?:^|\s|-)(red|orange|yellow|amber)-\d+/;
      expect(forbiddenPattern.test(allClasses)).toBe(false);

      const allText = collectAllText(container);
      expect(allText).not.toContain("!");
    });
  });
});
