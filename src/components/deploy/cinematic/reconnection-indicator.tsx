/**
 * ReconnectionIndicator — A subtle badge displayed when the WebSocket is
 * reconnecting, without disrupting the current stage visualization.
 *
 * Positioned in the bottom-right area of the overlay as a small pill/badge
 * with a pulsing animation. Uses AnimatePresence for smooth enter/exit.
 *
 * Requirements traced: 14.3, 14.4
 * - 14.3: Display a subtle reconnection indicator when WebSocket is in
 *   "reconnecting" state without disrupting the current stage visualization.
 * - 14.4: Can be displayed simultaneously with error Stage_Node.
 */

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS } from "./design-tokens";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReconnectionIndicatorProps {
  isReconnecting: boolean;
  reducedMotion: boolean;
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const badgeVariants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.9,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

const badgeVariantsReduced = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

const pulseVariants = {
  idle: { opacity: 0.6 },
  pulse: {
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconnectionIndicator({
  isReconnecting,
  reducedMotion,
}: ReconnectionIndicatorProps) {
  return (
    <AnimatePresence>
      {isReconnecting && (
        <motion.div
          className="fixed bottom-6 right-6 z-[60] pointer-events-none"
          variants={reducedMotion ? badgeVariantsReduced : badgeVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-testid="reconnection-indicator"
          role="status"
          aria-live="polite"
          aria-label="WebSocket reconnecting"
        >
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md"
            style={{
              backgroundColor: "hsl(155 20% 10% / 0.85)",
              // COLORS.warning is an hsl(...) string — hex alpha-suffix
              // concatenation (`${COLORS.warning}40`) produces invalid CSS
              // on an hsl() value (only works appended to #rrggbb); this
              // was silently no-op-ing before. Uses the CSS Color 4
              // `hsl(h s% l% / a)` syntax instead, matching the same hue.
              border: "1px solid hsl(32 95% 44% / 0.4)",
              boxShadow: "0 0 12px 2px hsl(32 95% 44% / 0.2)",
            }}
          >
            {/* Pulsing dot indicator */}
            <motion.div
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS.warning }}
              variants={pulseVariants}
              initial="idle"
              animate={reducedMotion ? "idle" : "pulse"}
              aria-hidden="true"
            />

            {/* Reconnecting text */}
            <span
              className="text-xs font-medium whitespace-nowrap"
              style={{ color: COLORS.textSecondary }}
            >
              Reconnecting…
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ReconnectionIndicator;
