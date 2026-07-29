// design-tokens.ts — Colors, timing, spacing, and breakpoint constants
// for the cinematic deploy visualization.

// Evergreen cinematic palette (design-system.md §6): the backdrop stays the
// one deliberately-dark "focus mode" surface (requirement 1.2 — dark
// background, opacity >= 0.95 — traced above, unchanged), but the stage-node
// cards floating on it are now the spec's "white 16px-radius cards on
// canvas" with an accent-bright (green) active/flowing-wire language,
// replacing the old generic blue. Values are plain HSL strings (not CSS
// vars) because several consumers interpolate them into inline SVG/canvas
// paint — kept as literal strings here too, matching the existing pattern,
// with each one commented to the Evergreen token it mirrors.
export const COLORS = {
  // Background — forest-black, same family as --opslin-bg-inverse (#0D1712)
  panelBg: "hsl(155 25% 6%)",
  panelBgOpacity: 0.97,
  dotGrid: "hsl(155 15% 18%)",
  dotGridOpacity: 0.3,

  // Stage accents — accent-bright (#22C55E) for active/completed states
  active: "hsl(142 71% 45%)",
  activePulse: "hsl(142 69% 58%)",
  completed: "hsl(142 71% 45%)",
  warning: "hsl(32 95% 44%)",
  error: "hsl(0 72% 51%)",

  // Stage node cards — white cards on the dark canvas (design-system.md §6
  // item 1: "nodes as white 16px-radius cards on canvas")
  cardBg: "hsl(0 0% 100% / 0.98)",
  cardBorder: "hsl(155 20% 90% / 0.6)",
  cardBackdropBlur: "12px",

  // Wires — flowing green beam (design-system.md §6 item 1)
  wirePending: "hsl(155 10% 30%)",
  wireActive: "hsl(142 71% 45%)",
  wireCompleted: "hsl(142 71% 45%)",

  // Celebration
  confettiGreen: "hsl(142 71% 45%)",
  confettiGold: "hsl(45 90% 55%)",

  // Text — dark-on-white now that cards are light (was light-on-dark)
  textPrimary: "hsl(155 25% 8%)",
  textSecondary: "hsl(155 8% 35%)",
  textMuted: "hsl(155 6% 55%)",
} as const;

export const TIMING = {
  // Panel lifecycle
  entryDuration: 0.3,
  exitDuration: 0.5,
  dismissDuration: 0.3,

  // Stage transitions
  stageEnter: 0.5,
  stageExit: 0.5,
  stageGlowTransition: 0.3,

  // Wire animations
  wireDraw: 0.4,
  particleTravel: 1.8,

  // Celebration
  celebrationMin: 2.0,
  celebrationMax: 4.0,
  celebrationDefault: 3.0,

  // Build minimum display
  buildMinDisplay: 0.5,

  // VU sequential activation
  vuActivationInterval: 0.15,
} as const;

export const SPACING = {
  stageNodeMinWidth: 320,
  stageNodeMaxWidth: 480,
  stageNodeCompactMinWidth: 280,
  stageGap: 80,
  wireLength: 60,
  viewportPadding: 40,
} as const;

export const BREAKPOINTS = {
  compact: 768,
} as const;
