"use client";

import { useEffect, useState } from "react";

/**
 * Ticks once a second (via `setInterval`, not a direct `Date.now()` read
 * during render) so a live timer/countdown can update without violating
 * this project's react-hooks purity rules. Returns a stable value when
 * `enabled` is false — callers gate this off when nothing needs to tick.
 */
export function useNowTick(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
