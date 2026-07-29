/**
 * Celebration overlay component — confetti particles + "Your app is LIVE!" banner.
 *
 * Uses framer-motion `motion.div` elements as confetti particles (no external library).
 * Displays for a configurable duration (2000-4000ms, default 3000ms) before calling onComplete.
 *
 * Requirements traced: 10.1, 10.2, 10.3, 10.4, 10.5
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { TIMING, COLORS } from "./design-tokens";
import { confettiVariants } from "./animation-variants";

// Inlined from the now-retired ./types (R3 — that file's only other exports
// were the gsap stage-orchestration taxonomy, which no longer exists).
export interface CelebrationOverlayProps {
  appDomain: string;
  reducedMotion: boolean;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 60;

const PARTICLE_COLORS = [
  "hsl(145 70% 55%)", // Green
  "hsl(145 70% 65%)", // Light green
  "hsl(45 90% 55%)",  // Gold
  "hsl(45 90% 70%)",  // Light gold
  "hsl(215 90% 60%)", // Blue accent
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfettiParticle {
  id: number;
  x: number;
  delay: number;
  color: string;
  size: number;
  shape: "square" | "circle" | "strip";
}

// ---------------------------------------------------------------------------
// Particle Generation
// ---------------------------------------------------------------------------

function generateParticles(): ConfettiParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 400,
    delay: Math.random() * 0.5,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    size: 6 + Math.random() * 6,
    shape: (["square", "circle", "strip"] as const)[i % 3],
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfettiParticleElement({ particle }: { particle: ConfettiParticle }) {
  const shapeStyles = getShapeStyles(particle);

  return (
    <motion.div
      key={particle.id}
      custom={{ x: particle.x, delay: particle.delay }}
      variants={confettiVariants}
      initial="initial"
      animate="animate"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        backgroundColor: particle.color,
        willChange: "transform, opacity",
        ...shapeStyles,
      }}
    />
  );
}

function getShapeStyles(particle: ConfettiParticle): React.CSSProperties {
  switch (particle.shape) {
    case "circle":
      return {
        width: particle.size,
        height: particle.size,
        borderRadius: "50%",
      };
    case "strip":
      return {
        width: particle.size * 0.4,
        height: particle.size * 1.5,
        borderRadius: 2,
      };
    case "square":
    default:
      return {
        width: particle.size,
        height: particle.size,
        borderRadius: 2,
      };
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CelebrationOverlay({
  appDomain,
  reducedMotion,
  onComplete,
}: CelebrationOverlayProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate particles once on mount (memoized to avoid regeneration on re-renders)
  const particles = useMemo(() => generateParticles(), []);

  // Duration: use the default from TIMING (3000ms = 3.0s * 1000)
  const durationMs = TIMING.celebrationDefault * 1000;

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [durationMs, onComplete]);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50"
      aria-hidden="true"
    >
      {/* Confetti particles — only rendered when reducedMotion is false */}
      {!reducedMotion && (
        <div className="absolute inset-0 overflow-hidden">
          {particles.map((particle) => (
            <ConfettiParticleElement key={particle.id} particle={particle} />
          ))}
        </div>
      )}

      {/* "Your app is LIVE!" banner — always shown */}
      <motion.div
        className="relative flex flex-col items-center gap-3 z-10"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reducedMotion ? 0 : 0.5,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <h2
          className="text-4xl md:text-5xl font-bold tracking-tight"
          style={{ color: COLORS.textPrimary }}
        >
          Your app is LIVE!
        </h2>
        <p
          className="text-lg md:text-xl font-mono"
          style={{ color: COLORS.confettiGreen }}
        >
          {appDomain}
        </p>
      </motion.div>
    </div>
  );
}
