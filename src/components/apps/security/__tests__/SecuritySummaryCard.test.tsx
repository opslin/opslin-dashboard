import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SECURITY_STATUS_DESCRIPTIONS } from "@/lib/security/shield-state";
import type { SecurityStatus } from "@/lib/security/shield-state";
import type { PlanTier } from "@/lib/security/plan-bundle-map";
import { SecuritySummaryCard } from "../SecuritySummaryCard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATUSES: SecurityStatus[] = [
  "At_Risk",
  "Basic",
  "Protected",
  "Hardened",
  "Fortified",
];

/** Human-readable label for each SecurityStatus (matches component's formatStatusLabel). */
const STATUS_LABELS: Record<SecurityStatus, string> = {
  At_Risk: "At Risk",
  Basic: "Basic",
  Protected: "Protected",
  Hardened: "Hardened",
  Fortified: "Fortified",
};

function renderCard(overrides: Partial<React.ComponentProps<typeof SecuritySummaryCard>> = {}) {
  const defaults: React.ComponentProps<typeof SecuritySummaryCard> = {
    planTier: "Pro",
    score: 67,
    status: "Protected",
    description: SECURITY_STATUS_DESCRIPTIONS["Protected"],
    isDeploying: false,
    ...overrides,
  };
  return render(<SecuritySummaryCard {...defaults} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SecuritySummaryCard", () => {
  // -------------------------------------------------------------------------
  // Requirement 5.2: Renders the integer score
  // -------------------------------------------------------------------------
  describe("renders the integer score", () => {
    it("displays the score value as text", () => {
      renderCard({ score: 44 });
      expect(screen.getByTestId("security-score")).toHaveTextContent("44");
    });

    it("displays score 0", () => {
      renderCard({ score: 0, status: "At_Risk", description: SECURITY_STATUS_DESCRIPTIONS["At_Risk"] });
      expect(screen.getByTestId("security-score")).toHaveTextContent("0");
    });

    it("displays score 100", () => {
      renderCard({ score: 100, status: "Fortified", description: SECURITY_STATUS_DESCRIPTIONS["Fortified"] });
      expect(screen.getByTestId("security-score")).toHaveTextContent("100");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.4: Renders the status label for each SecurityStatus
  // -------------------------------------------------------------------------
  describe("renders the status label for each SecurityStatus", () => {
    for (const status of ALL_STATUSES) {
      it(`renders "${STATUS_LABELS[status]}" for status "${status}"`, () => {
        renderCard({ status, description: SECURITY_STATUS_DESCRIPTIONS[status] });
        expect(screen.getByTestId("security-status")).toHaveTextContent(STATUS_LABELS[status]);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 5.5: Renders the description string for each SecurityStatus
  // -------------------------------------------------------------------------
  describe("renders the description string for each SecurityStatus", () => {
    for (const status of ALL_STATUSES) {
      it(`renders the description for "${status}"`, () => {
        const description = SECURITY_STATUS_DESCRIPTIONS[status];
        renderCard({ status, description });
        expect(screen.getByTestId("security-description")).toHaveTextContent(description);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 5.1: Displays the plan tier label
  // -------------------------------------------------------------------------
  describe("renders the plan tier label", () => {
    const tiers: PlanTier[] = ["Free", "Starter", "Pro", "Business", "Enterprise"];

    for (const tier of tiers) {
      it(`displays "${tier}" when planTier is "${tier}"`, () => {
        renderCard({ planTier: tier });
        expect(screen.getByTestId("security-plan-tier")).toHaveTextContent(tier);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 5.8: Placeholder "Unknown" when planTier === null
  // -------------------------------------------------------------------------
  describe("renders placeholder when planTier is null", () => {
    it('displays "Unknown" when planTier is null', () => {
      renderCard({ planTier: null });
      expect(screen.getByTestId("security-plan-tier")).toHaveTextContent("Unknown");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.6: Deploying indicator renders only when isDeploying === true
  // -------------------------------------------------------------------------
  describe("deploying indicator", () => {
    it("renders the deploying indicator when isDeploying is true", () => {
      renderCard({ isDeploying: true });
      expect(screen.getByTestId("deploying-indicator")).toBeInTheDocument();
    });

    it("does not render the deploying indicator when isDeploying is false", () => {
      renderCard({ isDeploying: false });
      expect(screen.queryByTestId("deploying-indicator")).not.toBeInTheDocument();
    });

    it("still renders the score when isDeploying is true", () => {
      renderCard({ isDeploying: true, score: 55 });
      expect(screen.getByTestId("security-score")).toHaveTextContent("55");
    });

    it("still renders the status label when isDeploying is true", () => {
      renderCard({ isDeploying: true, status: "Basic", description: SECURITY_STATUS_DESCRIPTIONS["Basic"] });
      expect(screen.getByTestId("security-status")).toHaveTextContent("Basic");
    });

    it("still renders the description when isDeploying is true", () => {
      const description = SECURITY_STATUS_DESCRIPTIONS["Hardened"];
      renderCard({ isDeploying: true, status: "Hardened", description });
      expect(screen.getByTestId("security-description")).toHaveTextContent(description);
    });

    it("still renders the plan tier when isDeploying is true", () => {
      renderCard({ isDeploying: true, planTier: "Business" });
      expect(screen.getByTestId("security-plan-tier")).toHaveTextContent("Business");
    });
  });
});
