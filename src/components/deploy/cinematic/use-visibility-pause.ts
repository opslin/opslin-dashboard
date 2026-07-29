import { useEffect, useState } from "react";

export function useVisibilityPause(): boolean {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const handler = () => setIsPaused(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return isPaused;
}
