"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { VuSlider, type VuSliderProps } from "./vu-slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * VuSliderWithDangerZone
 *
 * Wraps {@link VuSlider} with the danger-zone confirmation gate. When the user
 * tries to drag past `safeVuCeiling` for the first time, the candidate value
 * is held in local state and an {@link AlertDialog} is shown instead of
 * immediately propagating to the parent. The parent only sees the new value
 * after the user explicitly acknowledges the danger zone.
 *
 * Behaviour rules (Requirements 3.1, 3.2):
 *  1. value > safeVuCeiling and not yet acknowledged → modal opens, value is
 *     NOT propagated.
 *  2. The modal mentions instability and Opslin' lack of responsibility.
 *  3. Cancel → reset to safeVuCeiling and propagate `(safeVuCeiling, false)`.
 *  4. Confirm → set acknowledged=true and propagate `(pendingValue, true)`.
 *  5. While acknowledged is true, further moves above safeVuCeiling propagate
 *     directly without re-triggering the modal.
 *  6. Moving back at or below safeVuCeiling resets acknowledged to false so a
 *     future trip above the ceiling re-triggers the gate.
 *
 * Validates: Requirements 3.1, 3.2
 */
export interface VuSliderWithDangerZoneProps
  extends Pick<
    VuSliderProps,
    | "planMaxVu"
    | "safeVuCeiling"
    | "recommendedVu"
    | "serverProfile"
    | "value"
    | "idPrefix"
    | "className"
  > {
  /**
   * Called whenever the effective slider value changes. The second argument
   * communicates whether the user has explicitly opted into the danger zone
   * for the current session.
   */
  onChange: (value: number, dangerZoneAcknowledged: boolean) => void;
}

export function VuSliderWithDangerZone(
  props: VuSliderWithDangerZoneProps
): React.JSX.Element {
  const {
    planMaxVu,
    safeVuCeiling,
    recommendedVu,
    serverProfile,
    value,
    idPrefix,
    className,
    onChange,
  } = props;

  const [pendingValue, setPendingValue] = React.useState<number | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);

  // If the parent ever drops the value back to/below the safe ceiling (e.g.
  // they reset the form), the acknowledgment should reset too. This keeps the
  // wrapper's state in sync with externally-driven value changes.
  React.useEffect(() => {
    if (acknowledged && value <= safeVuCeiling) {
      setAcknowledged(false);
    }
  }, [acknowledged, value, safeVuCeiling]);

  const handleSliderChange = React.useCallback(
    (next: number) => {
      // Above the ceiling and not yet acknowledged → intercept.
      if (next > safeVuCeiling && !acknowledged) {
        setPendingValue(next);
        return;
      }

      // Moving back to/below the safe ceiling resets acknowledgment so the
      // next trip above the ceiling re-prompts.
      if (next <= safeVuCeiling) {
        if (acknowledged) {
          setAcknowledged(false);
        }
        onChange(next, false);
        return;
      }

      // Above ceiling + already acknowledged → propagate directly.
      onChange(next, true);
    },
    [acknowledged, onChange, safeVuCeiling]
  );

  const handleConfirm = React.useCallback(() => {
    if (pendingValue === null) return;
    setAcknowledged(true);
    onChange(pendingValue, true);
    setPendingValue(null);
  }, [onChange, pendingValue]);

  const handleCancel = React.useCallback(() => {
    setPendingValue(null);
    onChange(safeVuCeiling, false);
  }, [onChange, safeVuCeiling]);

  const dialogOpen = pendingValue !== null;

  return (
    <>
      <VuSlider
        planMaxVu={planMaxVu}
        safeVuCeiling={safeVuCeiling}
        recommendedVu={recommendedVu}
        serverProfile={serverProfile}
        value={value}
        onChange={handleSliderChange}
        dangerZoneAcknowledged={acknowledged}
        idPrefix={idPrefix}
        className={className}
      />
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          // Closing via escape / outside click is treated as cancel.
          if (!open && dialogOpen) {
            handleCancel();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              Danger zone — server may become unstable
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are requesting{" "}
              <span className="font-semibold text-foreground">
                {pendingValue ?? 0} virtual users
              </span>
              , which is above the safe ceiling of{" "}
              <span className="font-semibold text-foreground">
                {safeVuCeiling} VUs
              </span>{" "}
              for this server. The server may become unstable or crash during
              testing. Opslin assumes no responsibility for instability above
              the safe ceiling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              I understand, proceed anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default VuSliderWithDangerZone;
