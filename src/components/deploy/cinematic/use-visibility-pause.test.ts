import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useVisibilityPause } from "./use-visibility-pause";

describe("useVisibilityPause", () => {
  let originalHidden: boolean;

  beforeEach(() => {
    originalHidden = document.hidden;
  });

  afterEach(() => {
    Object.defineProperty(document, "hidden", {
      value: originalHidden,
      writable: true,
      configurable: true,
    });
  });

  it("returns false initially when document is visible", () => {
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useVisibilityPause());
    expect(result.current).toBe(false);
  });

  it("returns true when document becomes hidden", () => {
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useVisibilityPause());

    act(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(true);
  });

  it("returns false when document becomes visible again", () => {
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useVisibilityPause());

    // First trigger to set paused state
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(true);

    // Now make visible again
    act(() => {
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useVisibilityPause());

    expect(addSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
