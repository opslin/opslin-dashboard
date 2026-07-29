export const chartColors = {
  primary: "var(--chart-1)",
  info: "var(--chart-2)",
  danger: "var(--chart-3)",
  warning: "var(--chart-4)",
  success: "var(--chart-5)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  surface: "var(--card)",
  surfaceAlt: "var(--secondary)",
  foreground: "var(--foreground)",
} as const;

export function colorMix(color: string, percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `color-mix(in srgb, ${color} ${clamped}%, transparent)`;
}

export function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// The terminal panel is pinned dark in both app themes (bg-inverse), so its
// theme must NOT track --background/--foreground/--chart-*/--primary/--ring
// — those flip with the light/dark toggle and would paint a light canvas
// with dark text inside the deliberately-dark panel. Read the invariant
// --opslin-bg-inverse / --opslin-text-inverse / --opslin-terminal-* tokens
// instead, which resolve to the same values regardless of theme.
export function createTerminalTheme() {
  return {
    background: readCssVar("--opslin-bg-inverse", "#0d1712"),
    foreground: readCssVar("--opslin-text-inverse", "#f4f7f4"),
    cursor: readCssVar("--opslin-text-inverse", "#f4f7f4"),
    black: readCssVar("--opslin-bg-inverse", "#0d1712"),
    red: readCssVar("--opslin-terminal-red", "#ef4444"),
    green: readCssVar("--opslin-terminal-green", "#22c55e"),
    yellow: readCssVar("--opslin-terminal-yellow", "#f59e0b"),
    blue: readCssVar("--opslin-terminal-blue", "#3b82f6"),
    magenta: readCssVar("--opslin-terminal-magenta", "#22c55e"),
    cyan: readCssVar("--opslin-terminal-cyan", "rgba(74, 222, 128, 0.45)"),
    white: readCssVar("--opslin-text-inverse", "#f4f7f4"),
    brightBlack: readCssVar("--opslin-text-on-inverse-muted", "rgba(244, 247, 244, 0.62)"),
    brightRed: readCssVar("--opslin-terminal-red", "#ef4444"),
    brightGreen: readCssVar("--opslin-terminal-green", "#22c55e"),
    brightYellow: readCssVar("--opslin-terminal-yellow", "#f59e0b"),
    brightBlue: readCssVar("--opslin-terminal-blue", "#3b82f6"),
    brightMagenta: readCssVar("--opslin-terminal-magenta", "#22c55e"),
    brightCyan: readCssVar("--opslin-terminal-cyan", "rgba(74, 222, 128, 0.45)"),
    brightWhite: readCssVar("--opslin-text-inverse", "#f4f7f4"),
  };
}
