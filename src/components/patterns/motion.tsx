"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Motion system helpers (design-system.md §6, "calm until it matters").
 * Page entrance: content blocks stagger 40-60ms apart, rise 8-12px + fade,
 * ONCE per navigation — never on data refetch. Reduced motion = instant
 * state swap, opacity-only, zero celebration.
 */

const staggerContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

const reducedContainerVariants: Variants = { hidden: {}, show: {} };
const reducedItemVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0 } },
};

/** Wrap a page's top-level content blocks (StatRow, cards, …) to stagger them in once on mount. */
export function StaggerGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduceMotion ? reducedContainerVariants : staggerContainerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/** One staggered block inside a StaggerGroup. */
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div className={cn(className)} variants={reduceMotion ? reducedItemVariants : staggerItemVariants}>
      {children}
    </motion.div>
  );
}

/**
 * Count-up 500ms ease-out on first paint of a StatTile (design-system.md
 * §6) — only animates once per mount, never on background refetch (the
 * caller controls that by not remounting the tile on refetch).
 */
export function useCountUp(target: number, durationMs = 500) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion || !Number.isFinite(target)) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [target, durationMs, reduceMotion]);

  return value;
}
