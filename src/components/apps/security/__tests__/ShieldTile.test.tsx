import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SHIELD_CATALOG, SHIELDS } from "@/lib/security/shield-catalog";
import { lowestUnlockingTier } from "@/lib/security/plan-bundle-map";
import { ShieldTile } from "../ShieldTile";

// ---------------------------------------------------------------------------
// Helper: collect all classNames from a container's DOM tree
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helper: collect all text content from a container
// ---------------------------------------------------------------------------
function collectAllText(container: HTMLElement): string {
  return container.textContent ?? "";
}

describe("ShieldTile", () => {
  // -------------------------------------------------------------------------
  // Badge text assertions per variant
  // Requirements: 6.2, 6.3, 6.4, 7.3
  // -------------------------------------------------------------------------
  describe("badge text per variant", () => {
    it('renders "Active" badge for the active variant', () => {
      render(<ShieldTile shield="Firewall_Shield" variant="active" />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it('renders "Pending" badge for the pending variant', () => {
      render(<ShieldTile shield="Firewall_Shield" variant="pending" />);
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    it('renders "Available in {tier}" for the locked variant', () => {
      render(
        <ShieldTile
          shield="Policy_Lock"
          variant="locked"
          unlockingTier="Enterprise"
          onUpgrade={vi.fn()}
        />
      );
      expect(screen.getByText("Available in Enterprise")).toBeInTheDocument();
    });

    it("renders the correct unlocking tier for each locked shield", () => {
      const testShields = ["Firewall_Shield", "Edge_Protection", "Threat_Shield"] as const;
      for (const shield of testShields) {
        const tier = lowestUnlockingTier(shield);
        const { unmount } = render(
          <ShieldTile
            shield={shield}
            variant="locked"
            unlockingTier={tier}
            onUpgrade={vi.fn()}
          />
        );
        expect(screen.getByText(`Available in ${tier}`)).toBeInTheDocument();
        unmount();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Color token assertions
  // Requirements: 6.3, 6.4, 7.6, 12.3
  // -------------------------------------------------------------------------
  describe("color tokens", () => {
    it("active badge uses the blue accent token (opslin-info)", () => {
      const { container } = render(
        <ShieldTile shield="SSL_Shield" variant="active" />
      );
      const badge = screen.getByText("Active");
      // The active badge uses CSS custom properties referencing the blue accent
      expect(badge.className).toContain("opslin-info");
    });

    it("pending badge uses neutral grey (muted)", () => {
      const { container } = render(
        <ShieldTile shield="SSL_Shield" variant="pending" />
      );
      const badge = screen.getByText("Pending");
      expect(badge.className).toContain("muted");
    });

    it("locked variant has zero className tokens matching red/orange/yellow/amber", () => {
      const { container } = render(
        <ShieldTile
          shield="Policy_Lock"
          variant="locked"
          unlockingTier="Enterprise"
          onUpgrade={vi.fn()}
        />
      );
      const allClasses = collectAllClassNames(container);
      const forbiddenPattern = /(?:^|\s|-)(red|orange|yellow|amber)-\d+/;
      expect(forbiddenPattern.test(allClasses)).toBe(false);
    });

    it('locked variant has zero "!" characters in rendered text', () => {
      const { container } = render(
        <ShieldTile
          shield="Policy_Lock"
          variant="locked"
          unlockingTier="Enterprise"
          onUpgrade={vi.fn()}
        />
      );
      const allText = collectAllText(container);
      expect(allText).not.toContain("!");
    });
  });

  // -------------------------------------------------------------------------
  // Locked variant interaction: onUpgrade invoked on click, Enter, Space
  // Requirements: 7.4, 7.5
  // -------------------------------------------------------------------------
  describe("locked variant onUpgrade interaction", () => {
    it("invokes onUpgrade on mouse click", () => {
      const onUpgrade = vi.fn();
      render(
        <ShieldTile
          shield="DDoS_Guard"
          variant="locked"
          unlockingTier="Business"
          onUpgrade={onUpgrade}
        />
      );
      const button = screen.getByRole("button", { name: /Available in Business/i });
      fireEvent.click(button);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it("invokes onUpgrade on Enter key press", () => {
      const onUpgrade = vi.fn();
      render(
        <ShieldTile
          shield="DDoS_Guard"
          variant="locked"
          unlockingTier="Business"
          onUpgrade={onUpgrade}
        />
      );
      const button = screen.getByRole("button", { name: /Available in Business/i });
      fireEvent.keyDown(button, { key: "Enter" });
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it("invokes onUpgrade on Space key press", () => {
      const onUpgrade = vi.fn();
      render(
        <ShieldTile
          shield="DDoS_Guard"
          variant="locked"
          unlockingTier="Business"
          onUpgrade={onUpgrade}
        />
      );
      const button = screen.getByRole("button", { name: /Available in Business/i });
      fireEvent.keyDown(button, { key: " " });
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // displayLabel and helperText sourced from SHIELD_CATALOG
  // Requirements: 6.2, 7.2, 12.1
  // -------------------------------------------------------------------------
  describe("displayLabel and helperText from SHIELD_CATALOG", () => {
    it("renders displayLabel from SHIELD_CATALOG for each shield (active variant)", () => {
      for (const shield of SHIELDS) {
        const { unmount } = render(<ShieldTile shield={shield} variant="active" />);
        expect(screen.getByText(SHIELD_CATALOG[shield].displayLabel)).toBeInTheDocument();
        unmount();
      }
    });

    it("renders helperText from SHIELD_CATALOG for each shield (active variant)", () => {
      for (const shield of SHIELDS) {
        const { unmount } = render(<ShieldTile shield={shield} variant="active" />);
        expect(screen.getByText(SHIELD_CATALOG[shield].helperText)).toBeInTheDocument();
        unmount();
      }
    });

    it("renders displayLabel from SHIELD_CATALOG for each shield (locked variant)", () => {
      for (const shield of SHIELDS) {
        const tier = lowestUnlockingTier(shield);
        const { unmount } = render(
          <ShieldTile shield={shield} variant="locked" unlockingTier={tier} onUpgrade={vi.fn()} />
        );
        expect(screen.getByText(SHIELD_CATALOG[shield].displayLabel)).toBeInTheDocument();
        unmount();
      }
    });

    it("renders helperText from SHIELD_CATALOG for each shield (locked variant)", () => {
      for (const shield of SHIELDS) {
        const tier = lowestUnlockingTier(shield);
        const { unmount } = render(
          <ShieldTile shield={shield} variant="locked" unlockingTier={tier} onUpgrade={vi.fn()} />
        );
        expect(screen.getByText(SHIELD_CATALOG[shield].helperText)).toBeInTheDocument();
        unmount();
      }
    });
  });
});
