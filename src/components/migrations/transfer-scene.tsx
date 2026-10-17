"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Two servers and the data moving between them, drawn in one SVG so it scales to any width.
 * "moving": tiles fly along the arc from the old server and land in the new one, whose lights pulse as each arrives.
 * "done": the arc is complete and a check sits in the middle. "idle": nothing moves.
 * Respects reduced motion: the tiles stay still on the arc.
 */

export type PacketKind = "app" | "database" | "file" | "image";

const GLYPH: Record<PacketKind, React.ReactNode> = {
    // lucide "box", "database", "file", "image" at 24x24
    app: (<><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>),
    database: (<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></>),
    file: (<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></>),
    image: (<><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>),
};

const TILE_COLOR: Record<PacketKind, string> = { app: "#3b82f6", database: "#2563eb", file: "#22c55e", image: "#10b981" };

function Tile({ kind }: { kind: PacketKind }) {
    return (
        <g>
            <rect x="-17" y="-17" width="34" height="34" rx="9" fill={TILE_COLOR[kind]} />
            <rect x="-17" y="-17" width="34" height="17" rx="9" fill="#fff" opacity="0.12" />
            <g transform="translate(-9 -9) scale(0.75)" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{GLYPH[kind]}</g>
        </g>
    );
}

function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const q = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(q.matches);
        const on = () => setReduced(q.matches);
        q.addEventListener?.("change", on);
        return () => q.removeEventListener?.("change", on);
    }, []);
    return reduced;
}

/** An isometric server: two stacked units with drive bays and status lights. `glow` pulses the lights on arrival. */
function ServerBox({ x, y, accent, pulse, dur }: { x: number; y: number; accent: "old" | "new"; pulse: boolean; dur: number }) {
    const a = 78; // half width
    const b = 40; // half depth
    const unit = 46; // height of one unit
    const light = accent === "new" ? "#3b82f6" : "#22c55e";
    const units = [0, 1];
    return (
        <g transform={`translate(${x} ${y}) scale(0.82)`}>
            <ellipse cx={0} cy={2 * unit + b + 6} rx={a + 6} ry={b * 0.55} className="fill-slate-900/[0.07] dark:fill-black/40" />
            {units.map((u) => {
                const top = u * unit;
                return (
                    <g key={u}>
                        {/* left face */}
                        <polygon points={`${-a},${top} 0,${top + b} 0,${top + b + unit} ${-a},${top + unit}`} className="fill-slate-200 stroke-slate-300/70 dark:fill-slate-600 dark:stroke-slate-500/50" strokeWidth="1" />
                        {/* right (front) face */}
                        <polygon points={`0,${top + b} ${a},${top} ${a},${top + unit} 0,${top + b + unit}`} className="fill-slate-50 stroke-slate-300/70 dark:fill-slate-500 dark:stroke-slate-400/50" strokeWidth="1" />
                        {/* drive bay */}
                        <polygon points={`10,${top + b - 2} ${a - 10},${top + 6} ${a - 10},${top + 26} 10,${top + b + 18}`} className="fill-slate-700 dark:fill-slate-800" />
                        <circle cx={22} cy={top + b + 4} r={3.6} fill={light}>
                            {pulse ? <animate attributeName="opacity" values="1;0.35;1" dur={`${dur / 2}s`} begin={`${u * 0.4}s`} repeatCount="indefinite" /> : null}
                        </circle>
                        <line x1={34} y1={top + b - 2} x2={a - 18} y2={top + 15} stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
                        {/* separation hairline */}
                        <polyline points={`${-a},${top + unit} 0,${top + b + unit} ${a},${top + unit}`} fill="none" className="stroke-white/70 dark:stroke-slate-400/40" strokeWidth="1.5" />
                    </g>
                );
            })}
            {/* top face */}
            <polygon points={`${-a},0 0,${-b} ${a},0 0,${b}`} className="fill-white dark:fill-slate-400" />
            <polygon points={`${-a},0 0,${-b} ${a},0 0,${b}`} fill="none" className="stroke-slate-200 dark:stroke-slate-500" strokeWidth="1" />
        </g>
    );
}

/** Where things sit. On a narrow screen the servers move closer and the view zooms in, so nothing becomes tiny. */
function layout(compact: boolean) {
    const L = compact ? 255 : 160;
    const R = compact ? 545 : 640;
    const sx = L + 80;
    const ex = R - 80;
    return {
        L, R,
        high: `M ${sx} 150 Q 400 ${compact ? 30 : 10} ${ex} 150`,
        low: `M ${sx} 165 Q 400 ${compact ? 85 : 75} ${ex} 165`,
        viewBox: compact ? "165 30 470 230" : "0 30 800 230",
        // caption centres as a share of the visible width
        left: compact ? ((L - 165) / 470) * 100 : (L / 800) * 100,
        right: compact ? ((R - 165) / 470) * 100 : (R / 800) * 100,
        still: compact ? [[350, 85], [400, 68], [450, 85]] : [[330, 75], [400, 52], [470, 75], [360, 115], [440, 115]],
    };
}

function useCompact() {
    const ref = useRef<HTMLElement | null>(null);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 800) < 560));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, compact] as const;
}

export function TransferScene({
    mode,
    kinds,
    sourceName,
    targetName,
    className,
}: {
    mode: "moving" | "done" | "idle";
    kinds: PacketKind[];
    sourceName: string;
    targetName: string;
    className?: string;
}) {
    const reduced = useReducedMotion();
    const [ref, compact] = useCompact();
    const g = layout(compact);
    const ARC_HIGH = g.high;
    const ARC_LOW = g.low;
    const animate = mode === "moving" && !reduced;
    const list: PacketKind[] = kinds.length > 0 ? kinds : ["app", "database", "file", "image"];
    const packets = Array.from({ length: 6 }, (_, i) => ({ kind: list[i % list.length]!, lane: i % 2 === 0 ? ARC_HIGH : ARC_LOW, begin: i * 0.6 }));
    const dur = 3.6;
    const stillPositions = g.still;

    return (
        <figure ref={ref} className={cn("relative w-full", className)} aria-label={mode === "done" ? "The copy reached the new server" : mode === "moving" ? `Copying from ${sourceName} to ${targetName}` : `${sourceName} and ${targetName}`}>
            <svg viewBox={g.viewBox} className="h-auto w-full" role="img" aria-hidden="true">
                <defs>
                    <radialGradient id="ts-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="ts-ok" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* the routes */}
                {[ARC_HIGH, ARC_LOW].map((d, i) => (
                    <path key={d} d={d} fill="none" strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" className={mode === "done" ? "stroke-emerald-500/70" : "stroke-blue-400/60"} opacity={i === 0 ? 1 : 0.6}>
                        {animate ? <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="0.8s" repeatCount="indefinite" /> : null}
                    </path>
                ))}

                <ServerBox x={g.L} y={110} accent="old" pulse={animate} dur={dur} />
                <g>
                    <circle cx={g.R} cy={160} r={110} fill={mode === "done" ? "url(#ts-ok)" : "url(#ts-glow)"}>
                        {animate ? <animate attributeName="opacity" values="0.4;1;0.4" dur={`${dur / 2}s`} repeatCount="indefinite" /> : null}
                    </circle>
                    <ServerBox x={g.R} y={110} accent="new" pulse={animate} dur={dur} />
                </g>

                {/* the data */}
                {animate
                    ? packets.map((p, i) => (
                        <g key={i} opacity="0">
                            <animateMotion dur={`${dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" path={p.lane} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.35 1" />
                            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.82;1" dur={`${dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
                            <animateTransform attributeName="transform" type="scale" additive="sum" values="0.6;1;1;0.55" keyTimes="0;0.15;0.8;1" dur={`${dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
                            <Tile kind={p.kind} />
                        </g>
                    ))
                    : mode === "moving" || mode === "idle"
                      ? stillPositions.map(([x, y], i) => (
                          <g key={i} transform={`translate(${x} ${y})`} opacity={mode === "idle" ? 0.5 : 1}><Tile kind={list[i % list.length]!} /></g>
                      ))
                      : null}

                {mode === "done"
                    ? (compact ? [[330, 110, "app"], [470, 110, "file"]] : [[300, 120, "app"], [345, 80, "file"], [455, 80, "database"], [500, 120, "image"]]).map(([x, y, k], i) => (
                        <g key={i} transform={`translate(${x} ${y}) scale(0.8)`}>
                            {!reduced ? <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 -5;0 0" dur="3s" begin={`${i * 0.4}s`} repeatCount="indefinite" /> : null}
                            <Tile kind={k as PacketKind} />
                        </g>
                    ))
                    : null}
                {mode === "done" ? (
                    <g transform="translate(400 110)">
                        <circle r="54" fill="url(#ts-ok)" />
                        <circle r="34" fill="#22c55e" />
                        <path d="M -14 0 L -4 10 L 15 -10" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                        {[0, 60, 120, 180, 240, 300].map((deg) => (
                            <line key={deg} x1="0" y1="-44" x2="0" y2="-50" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" transform={`rotate(${deg})`} />
                        ))}
                    </g>
                ) : null}
            </svg>
            <figcaption className="relative h-12">
                <span style={{ left: `${g.left}%` }} className="absolute top-0 -translate-x-1/2 rounded-lg bg-muted/80 px-3 py-1.5 text-center"><span className="block text-xs font-medium text-foreground">Old server</span><span className="block max-w-[9rem] truncate text-[11px] text-muted-foreground">{sourceName}</span></span>
                <span style={{ left: `${g.right}%` }} className="absolute top-0 -translate-x-1/2 rounded-lg bg-primary/10 px-3 py-1.5 text-center"><span className="block text-xs font-medium text-primary">New server</span><span className="block max-w-[9rem] truncate text-[11px] text-muted-foreground">{targetName}</span></span>
            </figcaption>
        </figure>
    );
}
