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
    background: readCssVar("--opslin-bg-inverse", "hsl(150 33% 7%)"),
    foreground: readCssVar("--opslin-text-inverse", "hsl(120 14% 96%)"),
    cursor: readCssVar("--opslin-text-inverse", "hsl(120 14% 96%)"),
    black: readCssVar("--opslin-bg-inverse", "hsl(150 33% 7%)"),
    red: readCssVar("--opslin-terminal-red", "hsl(0 84% 60%)"),
    green: readCssVar("--opslin-terminal-green", "hsl(142 71% 45%)"),
    yellow: readCssVar("--opslin-terminal-yellow", "hsl(38 92% 50%)"),
    blue: readCssVar("--opslin-terminal-blue", "hsl(217 91% 60%)"),
    magenta: readCssVar("--opslin-terminal-magenta", "hsl(142 71% 45%)"),
    cyan: readCssVar("--opslin-terminal-cyan", "hsl(142 69% 58% / 0.45)"),
    white: readCssVar("--opslin-text-inverse", "hsl(120 14% 96%)"),
    brightBlack: readCssVar("--opslin-text-on-inverse-muted", "hsl(120 14% 96% / 0.62)"),
    brightRed: readCssVar("--opslin-terminal-red", "hsl(0 84% 60%)"),
    brightGreen: readCssVar("--opslin-terminal-green", "hsl(142 71% 45%)"),
    brightYellow: readCssVar("--opslin-terminal-yellow", "hsl(38 92% 50%)"),
    brightBlue: readCssVar("--opslin-terminal-blue", "hsl(217 91% 60%)"),
    brightMagenta: readCssVar("--opslin-terminal-magenta", "hsl(142 71% 45%)"),
    brightCyan: readCssVar("--opslin-terminal-cyan", "hsl(142 69% 58% / 0.45)"),
    brightWhite: readCssVar("--opslin-text-inverse", "hsl(120 14% 96%)"),
  };
}
