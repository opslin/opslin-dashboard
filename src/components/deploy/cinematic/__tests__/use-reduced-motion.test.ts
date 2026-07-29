import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useReducedMotion } from "../use-reduced-motion";

describe("useReducedMotion", () => {
  let listeners: Map<string, (e: MediaQueryListEvent) => void>;
  let matchesValue: boolean;

  beforeEach(() => {
    listeners = new Map();
    matchesValue = false;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: matchesValue,
        media: query,
        addEventListener: (event: string, handler: (e: MediaQueryListEvent) => void) => {
          listeners.set(event, handler);
        },
        removeEventListener: (event: string, _handler: (e: MediaQueryListEvent) => void) => {
          listeners.delete(event);
        },
      })),
    });
  });

  afterEach(() => {
    listeners.clear();
  });

  it("returns false when prefers-reduced-motion is not set", () => {
    matchesValue = false;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when prefers-reduced-motion: reduce is active", () => {
    matchesValue = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the media query changes", () => {
    matchesValue = false;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Simulate the media query changing to reduced motion
    act(() => {
      const handler = listeners.get("change");
      handler?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it("updates back to false when reduced motion is disabled", () => {
    matchesValue = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      const handler = listeners.get("change");
      handler?.({ matches: false } as MediaQueryListEvent);
    });

    expect(result.current).toBe(false);
  });

  it("cleans up the event listener on unmount", () => {
    matchesValue = false;
    const { unmount } = renderHook(() => useReducedMotion());

    expect(listeners.has("change")).toBe(true);

    unmount();

    expect(listeners.has("change")).toBe(false);
  });

  it("queries the correct media query string", () => {
    renderHook(() => useReducedMotion());
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
