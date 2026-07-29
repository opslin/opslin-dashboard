import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppHeaderActions, type AppHeaderActionsProps } from "../AppHeaderActions";
import type { AppStatus } from "@/lib/security/shield-state";

// ---------------------------------------------------------------------------
// Helper: default props factory
// ---------------------------------------------------------------------------
function makeProps(overrides: Partial<AppHeaderActionsProps> = {}): AppHeaderActionsProps {
  return {
    appName: "My App",
    appType: "NODEJS",
    appStatus: "running",
    domainConfigured: true,
    appUrl: "https://myapp.example.com",
    onRedeploy: vi.fn(),
    onOpenSettings: vi.fn(),
    redeployState: "idle",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// All recognized app statuses for cross-product tests
// ---------------------------------------------------------------------------
const ALL_STATUSES: AppStatus[] = ["pending", "deploying", "running", "stopped", "error"];

describe("AppHeaderActions", () => {
  // -------------------------------------------------------------------------
  // Requirement 2.2: Exactly three primary buttons/links render
  // -------------------------------------------------------------------------
  describe("renders exactly three primary actions", () => {
    it("renders Open, Redeploy, and Settings actions", () => {
      render(<AppHeaderActions {...makeProps()} />);

      // Open is rendered as a link when enabled
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.getByText("Redeploy")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("renders exactly three action elements (buttons/links) in the actions area", () => {
      render(<AppHeaderActions {...makeProps()} />);

      // Open (link), Redeploy (button), Settings (button)
      const openLink = screen.getByRole("link", { name: /open/i });
      const redeployButton = screen.getByRole("button", { name: /redeploy/i });
      const settingsButton = screen.getByRole("button", { name: /settings/i });

      expect(openLink).toBeInTheDocument();
      expect(redeployButton).toBeInTheDocument();
      expect(settingsButton).toBeInTheDocument();
    });

    it("renders exactly three action elements when Open is disabled", () => {
      render(<AppHeaderActions {...makeProps({ appStatus: "stopped" })} />);

      // When disabled, Open is a button with aria-disabled
      const buttons = screen.getAllByRole("button");
      // Should have 3 buttons: disabled Open, Redeploy, Settings
      expect(buttons).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Requirements 2.3, 2.5: Open enabled iff RUNNING && domainConfigured
  // Walk the 5×2 cross-product of (appStatus, domainConfigured)
  // -------------------------------------------------------------------------
  describe("Open action enabled/disabled cross-product (5 statuses × 2 domain states)", () => {
    const domainStates = [true, false] as const;

    for (const status of ALL_STATUSES) {
      for (const domainConfigured of domainStates) {
        const shouldBeEnabled = status === "running" && domainConfigured;
        const label = `appStatus=${status}, domainConfigured=${domainConfigured}`;

        it(`Open is ${shouldBeEnabled ? "enabled" : "disabled"} when ${label}`, () => {
          render(
            <AppHeaderActions
              {...makeProps({
                appStatus: status,
                domainConfigured,
                appUrl: domainConfigured ? "https://myapp.example.com" : null,
              })}
            />
          );

          if (shouldBeEnabled) {
            // Enabled: rendered as a link
            const link = screen.getByRole("link", { name: /open/i });
            expect(link).toBeInTheDocument();
            expect(link).not.toHaveAttribute("aria-disabled");
          } else {
            // Disabled: rendered as a button with aria-disabled="true"
            const button = screen.getByRole("button", { name: /open/i });
            expect(button).toHaveAttribute("aria-disabled", "true");
          }
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 2.5: Disabled Open exposes accessible name explaining reason
  // -------------------------------------------------------------------------
  describe("disabled Open accessible name explains the reason", () => {
    it('shows "App is not running" when appStatus is not running', () => {
      for (const status of ["pending", "deploying", "stopped", "error"] as AppStatus[]) {
        const { unmount } = render(
          <AppHeaderActions
            {...makeProps({ appStatus: status, domainConfigured: true })}
          />
        );

        const button = screen.getByRole("button", { name: /open/i });
        const ariaLabel = button.getAttribute("aria-label") ?? "";
        expect(ariaLabel).toContain("App is not running");
        unmount();
      }
    });

    it('shows "No domain configured" when running but no domain', () => {
      render(
        <AppHeaderActions
          {...makeProps({ appStatus: "running", domainConfigured: false, appUrl: null })}
        />
      );

      const button = screen.getByRole("button", { name: /open/i });
      const ariaLabel = button.getAttribute("aria-label") ?? "";
      expect(ariaLabel).toContain("No domain configured");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.4: Enabled Open uses target="_blank" rel="noopener"
  // -------------------------------------------------------------------------
  describe("Open link attributes when enabled", () => {
    it('uses target="_blank" and rel="noopener"', () => {
      render(<AppHeaderActions {...makeProps()} />);

      const link = screen.getByRole("link", { name: /open/i });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
    });

    it("links to the appUrl", () => {
      const url = "https://custom.example.com";
      render(<AppHeaderActions {...makeProps({ appUrl: url })} />);

      const link = screen.getByRole("link", { name: /open/i });
      expect(link).toHaveAttribute("href", url);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.6: Redeploy renders spinner while in-progress
  // -------------------------------------------------------------------------
  describe("Redeploy spinner behavior", () => {
    it("renders a spinner (animate-spin) when redeployState is in-progress", () => {
      const { container } = render(
        <AppHeaderActions {...makeProps({ redeployState: "in-progress" })} />
      );

      // The Loader2 icon has animate-spin class
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("does not render a spinner when redeployState is idle", () => {
      const { container } = render(
        <AppHeaderActions {...makeProps({ redeployState: "idle" })} />
      );

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).not.toBeInTheDocument();
    });

    it("disables the Redeploy button when redeployState is in-progress", () => {
      render(<AppHeaderActions {...makeProps({ redeployState: "in-progress" })} />);

      const button = screen.getByRole("button", { name: /redeploy/i });
      expect(button).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.7: Settings invokes the onOpenSettings callback
  // -------------------------------------------------------------------------
  describe("Settings action", () => {
    it("invokes onOpenSettings when clicked", () => {
      const onOpenSettings = vi.fn();
      render(<AppHeaderActions {...makeProps({ onOpenSettings })} />);

      const button = screen.getByRole("button", { name: /settings/i });
      fireEvent.click(button);
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.1: Header displays app name, type, and status
  // -------------------------------------------------------------------------
  describe("app identity rendering", () => {
    it("renders the app name as a heading", () => {
      render(<AppHeaderActions {...makeProps({ appName: "Test App" })} />);
      expect(screen.getByRole("heading", { name: "Test App" })).toBeInTheDocument();
    });

    it("renders the app type", () => {
      render(<AppHeaderActions {...makeProps({ appType: "STATIC" })} />);
      expect(screen.getByText("STATIC")).toBeInTheDocument();
    });

    it("renders the status badge", () => {
      render(<AppHeaderActions {...makeProps({ appStatus: "running" })} />);
      // AppStatusBadge renders the status label (capitalized)
      expect(screen.getByText("Running")).toBeInTheDocument();
    });
  });
});
