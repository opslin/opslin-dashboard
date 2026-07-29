// animation-variants.ts — Shared framer-motion variant definitions
// for the cinematic deploy visualization.
//
// Trimmed in R3: this file used to also hold panelVariants/stageEnterVariants/
// glowPulseVariants/wireDrawVariants/upcomingVariants/reducedMotionOverrides,
// all used exclusively by the retired gsap stage-orchestration components
// (stage-node-*.tsx, connecting-wire.tsx, viewport-window.tsx,
// cinematic-deploy-overlay.tsx). Only confettiVariants survives — the one
// remaining consumer is celebration-overlay.tsx (kept, doc 04 §2).

import { type Variants } from "framer-motion";

/** Confetti particle */
export const confettiVariants: Variants = {
  initial: (custom: { x: number; delay: number }) => ({
    opacity: 1,
    y: 0,
    x: custom.x,
    rotate: 0,
    scale: 1,
  }),
  animate: (custom: { x: number; delay: number }) => ({
    opacity: [1, 1, 0],
    y: [0, -200, 400],
    x: [
      custom.x,
      custom.x + (Math.random() - 0.5) * 100,
      custom.x + (Math.random() - 0.5) * 200,
    ],
    rotate: [
      0,
      360 * (Math.random() > 0.5 ? 1 : -1),
      720 * (Math.random() > 0.5 ? 1 : -1),
    ],
    scale: [1, 1.2, 0.5],
    transition: {
      duration: 2.5,
      delay: custom.delay,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};
