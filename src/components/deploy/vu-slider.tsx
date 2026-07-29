"use client";

import * as React from "react";
import { AlertTriangle, ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VuSlider
 *
 * Renders the Virtual-User selection slider for a deploy with capacity advisory
 * data above the track. The slider range is [0, planMaxVu]. A green tick marks
 * the `safeVuCeiling` boundary, and the segment between `safeVuCeiling` and the
 * current `value` is rendered in an orange "danger zone" colour when the user
 * has dragged past the safe ceiling.
 *
 * The actual danger-zone confirmation gate (warning overlay, "I understand"
 * button) lives in Task 11.2 — this component only accepts a derived
 * `dangerZoneAcknowledged` prop and renders a subtle visual indicator.
 *
 * Validates: Requirements 3.1, 2.1
 */
export interface VuSliderProps {
  /** Maximum VUs allowed by the org's plan (e.g. 10 for Pro). */
  planMaxVu: number;
  /** Capacity-advisor ceiling. 0 means "VU not safe on this server". */
  safeVuCeiling: number;
  /** min(planMaxVu, safeVuCeiling) — highlighted as the suggested choice. */
  recommendedVu: number;
  /** Optional server profile for the capacity panel. */
  serverProfile?: {
    cpuCores: number;
    totalMemMb: number;
  };
  /** Controlled slider value. */
  value: number;
  /** Called with the clamped value whenever the slider moves. */
  onChange: (value: number) => void;
  /**
   * Set by Task 11.2's confirmation gate after the user explicitly opts into
   * the danger zone. When true, the danger-zone segment switches from a
   * "needs confirmation" indicator to an "acknowledged" indicator.
   */
  dangerZoneAcknowledged?: boolean;
  /** Optional id prefix for ARIA wiring with surrounding labels. */
  idPrefix?: string;
  className?: string;
}

const ABSOLUTE_HARD_CAP = 100;

function clampVu(value: number, planMaxVu: number): number {
  if (!Number.isFinite(value)) return 0;
  const cap = Math.min(Math.max(planMaxVu, 0), ABSOLUTE_HARD_CAP);
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > cap) return cap;
  return rounded;
}

function pctOf(value: number, max: number): number {
  if (max <= 0) return 0;
  const pct = (value / max) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

function formatRamGb(totalMemMb: number): string {
  return `${Math.round(totalMemMb / 1024)} GB`;
}

export function VuSlider(props: VuSliderProps): React.JSX.Element {
  const {
    planMaxVu,
    safeVuCeiling,
    recommendedVu,
    serverProfile,
    value,
    onChange,
    dangerZoneAcknowledged = false,
    idPrefix = "vu-slider",
    className,
  } = props;

  const sliderId = `${idPrefix}-input`;
  const labelId = `${idPrefix}-label`;
  const descId = `${idPrefix}-desc`;

  const effectivePlanMax = Math.min(Math.max(planMaxVu, 0), ABSOLUTE_HARD_CAP);
  const clampedValue = clampVu(value, effectivePlanMax);
  const isUnavailable = safeVuCeiling <= 0;
  const inDangerZone = clampedValue > safeVuCeiling;

  const safePct = pctOf(safeVuCeiling, effectivePlanMax);
  const valuePct = pctOf(clampedValue, effectivePlanMax);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = clampVu(Number(event.target.value), effectivePlanMax);
      onChange(next);
    },
    [effectivePlanMax, onChange]
  );

  // ── Capacity advisory panel (rendered above the slider) ───────────────────
  const advisoryPanel = (
    <div className="grid gap-3 rounded-md border border-border/70 bg-card/60 p-4 text-sm sm:grid-cols-2">
      {serverProfile ? (
        <div className="flex items-start gap-2">
          <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Server</div>
            <div className="font-medium text-foreground">
              {serverProfile.cpuCores} cores, {formatRamGb(serverProfile.totalMemMb)} RAM
            </div>
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Safe ceiling</div>
        <div className={cn("font-medium", isUnavailable ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
          {safeVuCeiling} VUs
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan max</div>
        <div className="font-medium text-foreground">{effectivePlanMax} VUs</div>
      </div>
      <div className="rounded-md bg-emerald-500/10 px-2 py-1 ring-1 ring-emerald-500/30 sm:col-span-2">
        <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Recommended</div>
        <div className="font-semibold text-emerald-700 dark:text-emerald-300">
          {recommendedVu} VUs
        </div>
      </div>
    </div>
  );

  // ── Disabled / empty state ────────────────────────────────────────────────
  if (isUnavailable) {
    return (
      <div className={cn("space-y-3", className)}>
        {advisoryPanel}
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">VU testing not available</div>
            <div className="text-xs opacity-90">
              Server is too resource-constrained to run virtual-user load tests safely.
              The deploy will fall back to a health-only check.
            </div>
          </div>
        </div>
        <div id={sliderId} aria-hidden className="opacity-50">
          <div className="relative h-2 w-full rounded-full bg-secondary" />
        </div>
      </div>
    );
  }

  // ── Active slider ─────────────────────────────────────────────────────────
  const trackBaseClass = "absolute inset-y-0 rounded-full";
  const safeSegmentWidth = `${Math.min(safePct, valuePct)}%`;
  const dangerSegmentLeft = `${safePct}%`;
  const dangerSegmentWidth = `${Math.max(0, valuePct - safePct)}%`;

  return (
    <div className={cn("space-y-3", className)}>
      {advisoryPanel}

      <div className="flex items-center justify-between">
        <label id={labelId} htmlFor={sliderId} className="text-sm font-medium text-foreground">
          Virtual users
        </label>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
            inDangerZone
              ? dangerZoneAcknowledged
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
              : "bg-secondary text-foreground"
          )}
        >
          {clampedValue}
        </span>
      </div>

      <div className="relative pt-3 pb-5">
        {/* Track layers */}
        <div className="relative h-2 w-full rounded-full bg-secondary">
          {/* Safe (green) filled segment */}
          <div
            className={cn(trackBaseClass, "left-0 bg-emerald-500")}
            style={{ width: safeSegmentWidth }}
          />
          {/* Danger-zone (orange) filled segment from safe ceiling to current value */}
          {inDangerZone ? (
            <div
              className={cn(
                trackBaseClass,
                dangerZoneAcknowledged ? "bg-amber-500" : "bg-orange-500",
                !dangerZoneAcknowledged && "ring-1 ring-orange-600/60"
              )}
              style={{ left: dangerSegmentLeft, width: dangerSegmentWidth }}
            />
          ) : null}

          {/* Tick marker at safeVuCeiling */}
          <div
            aria-hidden
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-sm bg-emerald-600"
            style={{ left: `${safePct}%` }}
            title={`Safe ceiling: ${safeVuCeiling} VUs`}
          />
        </div>

        {/* The actual range input — sits on top of the styled track. The input
            itself is transparent so it doesn't paint over our coloured layers,
            but it provides the native thumb, keyboard support, and a11y. */}
        <input
          id={sliderId}
          type="range"
          min={0}
          max={effectivePlanMax}
          step={1}
          value={clampedValue}
          onChange={handleChange}
          aria-label="Virtual user count"
          aria-labelledby={labelId}
          aria-describedby={descId}
          aria-valuemin={0}
          aria-valuemax={effectivePlanMax}
          aria-valuenow={clampedValue}
          className={cn(
            "absolute inset-x-0 top-2 h-2 w-full cursor-pointer appearance-none bg-transparent",
            "accent-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        />

        {/* Range scale labels */}
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            safe: {safeVuCeiling}
          </span>
          <span>{effectivePlanMax}</span>
        </div>
      </div>

      <p id={descId} className="text-xs text-muted-foreground">
        {inDangerZone ? (
          <span className={cn(dangerZoneAcknowledged ? "text-amber-600 dark:text-amber-400" : "text-orange-600 dark:text-orange-400")}>
            {dangerZoneAcknowledged
              ? "Danger zone acknowledged. Opslin assumes no responsibility for instability above the safe ceiling."
              : `Above the safe ceiling (${safeVuCeiling}). Confirmation will be required before deploy.`}
          </span>
        ) : (
          <>
            Recommended {recommendedVu} VUs based on plan limits and current server capacity.
          </>
        )}
      </p>
    </div>
  );
}

export default VuSlider;
