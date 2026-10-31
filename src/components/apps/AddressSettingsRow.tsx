"use client";

import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One flat row (DESIGN.md S2): which settings in the project's compose file still point to localhost, and one action
 * that makes them use the app's real address. The address only exists once the app has one, so the value saved is a
 * placeholder the deploy fills in each time.
 */
export function AddressSettingsRow({ keys, applied, onApply, disabled }: { keys: string[]; applied: boolean; onApply: () => void; disabled?: boolean }) {
    if (keys.length === 0) return null;
    const names = keys.length <= 2 ? keys.join(" and ") : `${keys.slice(0, 2).join(", ")} and ${keys.length - 2} more`;
    return (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-2.5" data-testid="address-settings-row">
            <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-40 flex-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {applied ? `${names} will use your app's address` : `${names} point${keys.length === 1 ? "s" : ""} to localhost`}
            </span>
            {applied ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="size-4 text-success" aria-hidden="true" /> Filled in when it goes live
                </span>
            ) : (
                <Button type="button" variant="outline" size="sm" onClick={onApply} disabled={disabled}>Use my app&apos;s address</Button>
            )}
        </div>
    );
}
