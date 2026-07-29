// WCAG AA contrast gate for opslin's design tokens (doc: docs/ui-refinement/02_OPSLIN_DESIGN_SYSTEM_PLAN.md §9).
// Parses src/styles/tokens.css directly (no hardcoded color duplication), resolves var()
// references and alpha compositing, then checks a curated set of text/background pairs that
// are actually used together in the codebase (see PAIRS below) against WCAG 2.1 AA thresholds:
// 4.5:1 for normal text, 3:1 for large text (>=24px, or >=18.66px bold) and non-text UI components.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tokensPath = `${root}/src/styles/tokens.css`;
const css = readFileSync(tokensPath, "utf8");

function extractBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Could not find "${selector} {" in tokens.css`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(open + 1, i - 1);
}

function parseVars(block) {
  const vars = new Map();
  const declPattern = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = declPattern.exec(block))) {
    vars.set(`--${m[1]}`, m[2].trim());
  }
  return vars;
}

function resolve(value, vars, seen = new Set()) {
  const varRefPattern = /^var\((--[\w-]+)\)$/;
  const m = value.match(varRefPattern);
  if (!m) return value;
  const name = m[1];
  if (seen.has(name)) throw new Error(`Circular var() reference: ${name}`);
  const next = vars.get(name);
  if (next === undefined) throw new Error(`Unresolved var(${name})`);
  seen.add(name);
  return resolve(next, vars, seen);
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] !== undefined ? Number(rgba[4]) : 1,
    };
  }
  throw new Error(`Unrecognized color value: ${value}`);
}

// Composite a (possibly translucent) color over an opaque base — needed for tokens like
// --opslin-success-muted (rgba, alpha < 1) which are always rendered over --card/--bg-canvas
// in practice, never over raw transparency.
function flatten(fg, base) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.a * fg.r + (1 - fg.a) * base.r,
    g: fg.a * fg.g + (1 - fg.a) * base.g,
    b: fg.a * fg.b + (1 - fg.a) * base.b,
    a: 1,
  };
}

function relLuminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(c1, c2) {
  const l1 = relLuminance(c1);
  const l2 = relLuminance(c2);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function buildTheme(block) {
  const vars = parseVars(block);
  const get = (name) => parseColor(resolve(`var(${name})`, vars));
  return { vars, get };
}

const light = buildTheme(extractBlock(":root"));
// .dark only overrides the tokens that differ from :root — merge so unset ones (e.g.
// --opslin-radius-*, --opslin-space-*, spacing/shadow tokens) still resolve for dark.
const darkBlock = extractBlock(".dark");
const darkVarsOnly = parseVars(darkBlock);
const mergedDarkVars = new Map([...light.vars, ...darkVarsOnly]);
const dark = {
  vars: mergedDarkVars,
  get: (name) => parseColor(resolve(`var(${name})`, mergedDarkVars)),
};

// Pairs actually rendered together in the codebase (grep-verified: text-* on bg-* Tailwind
// utility combinations used across opslin-dashboard/src). "large" = UI text/components typically
// set at >=18px or bold/icon-sized, gated at 3:1; everything else is normal body/label text at 4.5:1.
const PAIRS = [
  { name: "text-primary on bg-canvas", fg: "--opslin-text-primary", bg: "--opslin-bg-canvas", size: "normal" },
  { name: "text-secondary on bg-canvas", fg: "--opslin-text-secondary", bg: "--opslin-bg-canvas", size: "normal" },
  { name: "text-tertiary on bg-canvas", fg: "--opslin-text-tertiary", bg: "--opslin-bg-canvas", size: "large" },
  { name: "text-primary on card", fg: "--opslin-text-primary", bg: "--opslin-bg-primary", size: "normal" },
  { name: "text-secondary on card", fg: "--opslin-text-secondary", bg: "--opslin-bg-primary", size: "normal" },
  { name: "text-tertiary on card", fg: "--opslin-text-tertiary", bg: "--opslin-bg-primary", size: "large" },
  { name: "muted-foreground on muted", fg: "--muted-foreground", bg: "--muted", size: "normal" },
  { name: "muted-foreground on card", fg: "--muted-foreground", bg: "--card", size: "normal" },
  { name: "muted-foreground on accent", fg: "--muted-foreground", bg: "--accent", size: "normal" },
  { name: "primary-foreground on primary (buttons)", fg: "--primary-foreground", bg: "--primary", size: "normal" },
  { name: "secondary-foreground on secondary", fg: "--secondary-foreground", bg: "--secondary", size: "normal" },
  { name: "accent-foreground on accent", fg: "--accent-foreground", bg: "--accent", size: "normal" },
  { name: "success-text on success-muted (over card)", fg: "--opslin-success-text", bg: "--opslin-success-muted", flattenOver: "--opslin-bg-primary", size: "normal" },
  { name: "warning-text on warning-muted (over card)", fg: "--opslin-warning-text", bg: "--opslin-warning-muted", flattenOver: "--opslin-bg-primary", size: "normal" },
  { name: "danger-text on danger-muted (over card)", fg: "--opslin-danger-text", bg: "--opslin-danger-muted", flattenOver: "--opslin-bg-primary", size: "normal" },
  { name: "info-text on info-muted (over card)", fg: "--opslin-info-text", bg: "--opslin-info-muted", flattenOver: "--opslin-bg-primary", size: "normal" },
  { name: "success-foreground on success (solid fill)", fg: "--opslin-success-foreground", bg: "--opslin-success-default", size: "normal" },
  { name: "warning-foreground on warning (solid fill)", fg: "--opslin-warning-foreground", bg: "--opslin-warning-default", size: "normal" },
  { name: "danger-foreground on danger (solid fill)", fg: "--opslin-danger-foreground", bg: "--opslin-danger-default", size: "normal" },
  { name: "info-foreground on info (solid fill)", fg: "--opslin-info-foreground", bg: "--opslin-info-default", size: "normal" },
  { name: "chart-violet on card (data labels)", fg: "--opslin-chart-violet", bg: "--opslin-bg-primary", size: "large" },
  { name: "accent-2 on card (insight chips)", fg: "--opslin-accent-2-default", bg: "--opslin-bg-primary", size: "large" },
  { name: "text-on-inverse-muted on sidebar (bg-inverse)", fg: "--opslin-text-on-inverse-muted", bg: "--opslin-bg-inverse", flattenOver: "--opslin-bg-inverse", size: "normal" },
  { name: "text-inverse on bg-inverse", fg: "--opslin-text-inverse", bg: "--opslin-bg-inverse", size: "normal" },
  { name: "text-inverse on bg-inverse-2", fg: "--opslin-text-inverse", bg: "--opslin-bg-inverse-2", size: "normal" },
];

const THRESHOLDS = { normal: 4.5, large: 3 };

function evaluateTheme(themeName, theme) {
  const rows = [];
  for (const pair of PAIRS) {
    const bgOpaque = pair.flattenOver ? theme.get(pair.flattenOver) : theme.get(pair.bg);
    const fgRaw = theme.get(pair.fg);
    const fg = flatten(fgRaw, bgOpaque);
    const bg = pair.flattenOver ? flatten(theme.get(pair.bg), bgOpaque) : bgOpaque;
    const ratio = contrastRatio(fg, bg);
    const threshold = THRESHOLDS[pair.size];
    rows.push({ theme: themeName, name: pair.name, ratio, threshold, pass: ratio >= threshold });
  }
  return rows;
}

const results = [...evaluateTheme("light", light), ...evaluateTheme("dark", dark)];
const failures = results.filter((r) => !r.pass);

const fmt = (r) => `${r.pass ? "PASS" : "FAIL"}  [${r.theme.padEnd(5)}] ${r.name.padEnd(45)} ${r.ratio.toFixed(2)}:1 (need ${r.threshold}:1)`;

console.log(`Opslin AA contrast check — ${results.length} pairs across light+dark (doc 02 §9)\n`);
for (const r of results) console.log(fmt(r));

console.log(`\n${results.length - failures.length}/${results.length} pairs pass AA.`);

if (failures.length > 0) {
  console.log(`\n${failures.length} failing pair(s) — fix-list for R1:`);
  for (const f of failures) console.log(`  - [${f.theme}] ${f.name}: ${f.ratio.toFixed(2)}:1, needs ${f.threshold}:1`);
  process.exit(1);
}

console.log("\nAll checked pairs pass WCAG AA.");
