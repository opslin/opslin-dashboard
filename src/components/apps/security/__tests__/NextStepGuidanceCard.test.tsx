/**
 * Component tests for `NextStepGuidanceCard`.
 *
 * Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.6, 11.8
 *
 * - Renders one fixture per `step.kind` and asserts exactly one suggestion node renders
 * - Asserts no className tokens match `/(?:^|\s|-)(red|orange|yellow|amber)-\d+/` for any branch
 * - Asserts clicking the activator invokes `onActivate(step)` once with the same step value
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NextStepGuidanceCard } from "../NextStepGuidanceCard";
import type { NextStep } from "@/lib/security/shield-state";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES: Record<string, NextStep> = {
  "troubleshoot-error": {
    kind: "troubleshoot-error",
    href: "/apps/[id]?settings=deployments",
  },
  "configure-domain": {
    kind: "configure-domain",
    href: "/apps/[id]?settings=domains",
  },
  "upgrade-plan": {
    kind: "upgrade-plan",
    targetTier: "Pro",
    href: "/settings?section=plan",
  },
  "all-protected": { kind: "all-protected" },
  "no-action": { kind: "no-action" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Regex that matches Tailwind color utility tokens for red, orange, yellow, or amber.
 * Matches patterns like "text-red-500", "bg-orange-400", "border-yellow-300", etc.
 */
const FORBIDDEN_COLOR_REGEX = /(?:^|\s|-)(red|orange|yellow|amber)-\d+/;

/**
 * Recursively collects all className values from a DOM tree.
 */
function collectClassNames(element: Element): string[] {
  const classes: string[] = [];
  if (element.className && typeof element.className === "string") {
    classes.push(element.className);
  }
  for (const child of Array.from(element.children)) {
    classes.push(...collectClassNames(child));
  }
  return classes;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NextStepGuidanceCard", () => {
  describe("renders exactly one suggestion node per step.kind", () => {
    it("renders troubleshoot-error suggestion", () => {
      const onActivate = vi.fn();
      render(
        <NextStepGuidanceCard
          step={FIXTURES["troubleshoot-error"]}
          onActivate={onActivate}
        />
      );

      const node = screen.getByTestId("next-step-troubleshoot-error");
      expect(node).toBeInTheDocument();

      // Exactly one suggestion node — no other step kinds rendered
      expect(screen.queryByTestId("next-step-configure-domain")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-upgrade-plan")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-all-protected")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-no-action")).not.toBeInTheDocument();
    });

    it("renders configure-domain suggestion", () => {
      const onActivate = vi.fn();
      render(
        <NextStepGuidanceCard
          step={FIXTURES["configure-domain"]}
          onActivate={onActivate}
        />
      );

      const node = screen.getByTestId("next-step-configure-domain");
      expect(node).toBeInTheDocument();

      expect(screen.queryByTestId("next-step-troubleshoot-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-upgrade-plan")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-all-protected")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-no-action")).not.toBeInTheDocument();
    });

    it("renders upgrade-plan suggestion", () => {
      const onActivate = vi.fn();
      render(
        <NextStepGuidanceCard
          step={FIXTURES["upgrade-plan"]}
          onActivate={onActivate}
        />
      );

      const node = screen.getByTestId("next-step-upgrade-plan");
      expect(node).toBeInTheDocument();

      expect(screen.queryByTestId("next-step-troubleshoot-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-configure-domain")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-all-protected")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-no-action")).not.toBeInTheDocument();
    });

    it("renders all-protected suggestion", () => {
      const onActivate = vi.fn();
      render(
        <NextStepGuidanceCard
          step={FIXTURES["all-protected"]}
          onActivate={onActivate}
        />
      );

      const node = screen.getByTestId("next-step-all-protected");
      expect(node).toBeInTheDocument();

      expect(screen.queryByTestId("next-step-troubleshoot-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-configure-domain")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-upgrade-plan")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-no-action")).not.toBeInTheDocument();
    });

    it("renders no-action suggestion", () => {
      const onActivate = vi.fn();
      render(
        <NextStepGuidanceCard
          step={FIXTURES["no-action"]}
          onActivate={onActivate}
        />
      );

      const node = screen.getByTestId("next-step-no-action");
      expect(node).toBeInTheDocument();

      expect(screen.queryByTestId("next-step-troubleshoot-error")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-configure-domain")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-upgrade-plan")).not.toBeInTheDocument();
      expect(screen.queryByTestId("next-step-all-protected")).not.toBeInTheDocument();
    });
  });

  describe("no red/orange/yellow/amber color tokens in any branch", () => {
    for (const [kind, step] of Object.entries(FIXTURES)) {
      it(`step.kind="${kind}" uses no forbidden color tokens`, () => {
        const onActivate = vi.fn();
        const { container } = render(
          <NextStepGuidanceCard step={step} onActivate={onActivate} />
        );

        const allClassNames = collectClassNames(container);
        for (const className of allClassNames) {
          expect(className).not.toMatch(FORBIDDEN_COLOR_REGEX);
        }
      });
    }
  });

  describe("clicking the activator invokes onActivate(step) once", () => {
    it("troubleshoot-error: activator calls onActivate with the step", () => {
      const onActivate = vi.fn();
      const step = FIXTURES["troubleshoot-error"];
      render(<NextStepGuidanceCard step={step} onActivate={onActivate} />);

      const button = screen.getByTestId("next-step-action");
      fireEvent.click(button);

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(step);
    });

    it("configure-domain: activator calls onActivate with the step", () => {
      const onActivate = vi.fn();
      const step = FIXTURES["configure-domain"];
      render(<NextStepGuidanceCard step={step} onActivate={onActivate} />);

      const button = screen.getByTestId("next-step-action");
      fireEvent.click(button);

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(step);
    });

    it("upgrade-plan: activator calls onActivate with the step", () => {
      const onActivate = vi.fn();
      const step = FIXTURES["upgrade-plan"];
      render(<NextStepGuidanceCard step={step} onActivate={onActivate} />);

      const button = screen.getByTestId("next-step-action");
      fireEvent.click(button);

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(step);
    });
  });
});
