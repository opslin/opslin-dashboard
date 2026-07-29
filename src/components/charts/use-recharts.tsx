"use client";

import { useEffect, useState } from "react";

type RechartsModule = typeof import("recharts");

let cachedRecharts: RechartsModule | null = null;
let pendingRecharts: Promise<RechartsModule> | null = null;

function loadRecharts() {
  if (cachedRecharts) {
    return Promise.resolve(cachedRecharts);
  }

  pendingRecharts ??= import("recharts").then((module) => {
    cachedRecharts = module;
    return module;
  });

  return pendingRecharts;
}

export function useRecharts() {
  const [recharts, setRecharts] = useState<RechartsModule | null>(cachedRecharts);

  useEffect(() => {
    let mounted = true;

    void loadRecharts().then((module) => {
      if (mounted) {
        setRecharts(module);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return recharts;
}

export function ChartLoading({ className = "h-48" }: { className?: string }) {
  return <div className={`${className} rounded-lg bg-muted animate-pulse`} />;
}
