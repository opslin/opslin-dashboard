import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CelebrationOverlay } from "../celebration-overlay";

// Mock framer-motion to avoid animation complexity in unit tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      style,
      className,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { custom?: unknown; variants?: unknown; initial?: unknown; animate?: unknown }) => (
      <div style={style} className={className} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("CelebrationOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "Your app is LIVE!" text', () => {
    const onComplete = vi.fn();
    render(
      <CelebrationOverlay
        appDomain="myapp.example.com"
        reducedMotion={false}
        onComplete={onComplete}
      />
    );
    expect(screen.getByText("Your app is LIVE!")).toBeInTheDocument();
  });

  it("renders the app domain", () => {
    const onComplete = vi.fn();
    render(
      <CelebrationOverlay
        appDomain="deploy.opslin.io"
        reducedMotion={false}
        onComplete={onComplete}
      />
    );
    expect(screen.getByText("deploy.opslin.io")).toBeInTheDocument();
  });

  it("calls onComplete after the celebration duration", () => {
    const onComplete = vi.fn();
    render(
      <CelebrationOverlay
        appDomain="myapp.example.com"
        reducedMotion={false}
        onComplete={onComplete}
      />
    );

    // Should not be called immediately
    expect(onComplete).not.toHaveBeenCalled();

    // Advance time to just before the default duration (3000ms)
    vi.advanceTimersByTime(2999);
    expect(onComplete).not.toHaveBeenCalled();

    // Advance past the duration
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not render confetti particles when reducedMotion is true", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <CelebrationOverlay
        appDomain="myapp.example.com"
        reducedMotion={true}
        onComplete={onComplete}
      />
    );

    // The confetti container (overflow-hidden div) should not be present
    const confettiContainer = container.querySelector(".overflow-hidden");
    expect(confettiContainer).not.toBeInTheDocument();
  });

  it("renders confetti particles when reducedMotion is false", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <CelebrationOverlay
        appDomain="myapp.example.com"
        reducedMotion={false}
        onComplete={onComplete}
      />
    );

    // The confetti container should be present with particle elements
    const confettiContainer = container.querySelector(".overflow-hidden");
    expect(confettiContainer).toBeInTheDocument();
    // Should have 60 particle divs inside
    const particles = confettiContainer?.querySelectorAll("div");
    expect(particles?.length).toBe(60);
  });

  it("shows the text banner even when reducedMotion is true", () => {
    const onComplete = vi.fn();
    render(
      <CelebrationOverlay
        appDomain="accessible-app.dev"
        reducedMotion={true}
        onComplete={onComplete}
      />
    );

    expect(screen.getByText("Your app is LIVE!")).toBeInTheDocument();
    expect(screen.getByText("accessible-app.dev")).toBeInTheDocument();
  });
});
