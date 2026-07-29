import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DomainSummaryCard } from "../DomainSummaryCard";

const clipboardWriteText = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  clipboardWriteText.mockReset();
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DomainSummaryCard", () => {
  describe("displayed URL text", () => {
    it("displays the domain when configured", () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="my-app.opslin.app"
          sslIndicator="Secured"
        />
      );

      expect(screen.getByTestId("domain-display")).toHaveTextContent(
        "app.example.com"
      );
    });

    it("displays the fallbackUrl when domain is null", () => {
      render(
        <DomainSummaryCard
          domain={null}
          fallbackUrl="my-app.opslin.app"
          sslIndicator="Secured"
        />
      );

      expect(screen.getByTestId("domain-display")).toHaveTextContent(
        "my-app.opslin.app"
      );
    });
  });

  describe("SSL indicator text", () => {
    it("renders 'Secured' for the Secured indicator", () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      const sslEl = screen.getByTestId("ssl-indicator");
      expect(sslEl).toHaveTextContent("Secured");
    });

    it("renders 'Provisioning' for the Provisioning indicator", () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Provisioning"
        />
      );

      const sslEl = screen.getByTestId("ssl-indicator");
      expect(sslEl).toHaveTextContent("Provisioning");
    });

    it("renders 'Not Configured' for the Not_Configured indicator", () => {
      render(
        <DomainSummaryCard
          domain={null}
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Not_Configured"
        />
      );

      const sslEl = screen.getByTestId("ssl-indicator");
      expect(sslEl).toHaveTextContent("Not Configured");
    });
  });

  describe("copy action URL scheme handling", () => {
    it("prepends https:// when no scheme is present", async () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(clipboardWriteText).toHaveBeenCalledWith(
        "https://app.example.com"
      );
    });

    it("does not prepend https:// when https scheme is already present", async () => {
      render(
        <DomainSummaryCard
          domain="https://app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(clipboardWriteText).toHaveBeenCalledWith(
        "https://app.example.com"
      );
    });

    it("does not prepend https:// when http scheme is already present", async () => {
      render(
        <DomainSummaryCard
          domain="http://app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Provisioning"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(clipboardWriteText).toHaveBeenCalledWith(
        "http://app.example.com"
      );
    });

    it("prepends https:// to fallbackUrl when domain is null and no scheme present", async () => {
      render(
        <DomainSummaryCard
          domain={null}
          fallbackUrl="my-app.opslin.app"
          sslIndicator="Not_Configured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(clipboardWriteText).toHaveBeenCalledWith(
        "https://my-app.opslin.app"
      );
    });
  });

  describe("clipboard success indicator", () => {
    it("shows the success indicator after a successful copy", async () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(screen.getByTestId("copy-success-indicator")).toBeVisible();
    });

    it("keeps the success indicator visible for at least 1 second", async () => {
      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      // Still visible after 999ms
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(screen.getByTestId("copy-success-indicator")).toBeVisible();

      // Disappears after the full timeout (1500ms total in the implementation)
      act(() => {
        vi.advanceTimersByTime(501);
      });
      expect(
        screen.queryByTestId("copy-success-indicator")
      ).not.toBeInTheDocument();
    });
  });

  describe("clipboard failure indicator", () => {
    it("shows the failure indicator when clipboard write rejects", async () => {
      clipboardWriteText.mockRejectedValue(new Error("Permission denied"));

      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      expect(screen.getByTestId("copy-failed-indicator")).toBeVisible();
    });

    it("failure indicator does not use red, orange, yellow, or amber class tokens", async () => {
      clipboardWriteText.mockRejectedValue(new Error("Permission denied"));

      render(
        <DomainSummaryCard
          domain="app.example.com"
          fallbackUrl="fallback.opslin.app"
          sslIndicator="Secured"
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-action"));
      });

      const failedIndicator = screen.getByTestId("copy-failed-indicator");
      const className = failedIndicator.className;
      expect(className).not.toMatch(
        /(?:^|\s|-)(red|orange|yellow|amber)-\d+/
      );
    });
  });
});
