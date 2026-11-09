"use client";

import { KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface StackNeed { name: string; why: string }

/** A setting whose name says it is a secret: hidden while typing. */
export function looksSecret(name: string): boolean {
    return /(?:SECRET|PASS|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|ACCESS_KEY|ENC_KEY|_KEY|KEY_BASE|CREDENTIALS?)$/.test(name);
}

/** True when every setting the project requires has a value (also when nothing is required). */
export function stackInputsComplete(needs: StackNeed[] | undefined, values: Record<string, string>): boolean {
    return (needs ?? []).every((need) => (values[need.name] ?? "").trim() !== "");
}

/**
 * One flat container (DESIGN.md S2): what the project's own code says it must have before it can start, asked before Deploy
 * so it is never discovered after a failed build. Label and reason on the left, the field on the right. Below it, one
 * disclosure that says what Opslin sets up by itself.
 */
export function StackInputs({ needs, willDo, values, onChange, disabled }: { needs: StackNeed[]; willDo: string[]; values: Record<string, string>; onChange: (name: string, value: string) => void; disabled?: boolean }) {
    if (needs.length === 0 && willDo.length === 0) return null;
    return (
        <div className="rounded-xl border bg-card" data-testid="stack-inputs">
            {needs.length > 0 ? (
                <>
                    <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                        <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="text-sm font-medium text-foreground">Needs your input</span>
                    </div>
                    {needs.map((need) => (
                        <div key={need.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3">
                            <div className="min-w-48 flex-1">
                                <div className="font-mono text-sm font-medium text-foreground [overflow-wrap:anywhere]">{need.name}</div>
                                <p className="mt-0.5 text-xs text-muted-foreground">{need.why}</p>
                            </div>
                            <Input
                                aria-label={need.name}
                                type={looksSecret(need.name) ? "password" : "text"}
                                className="w-full sm:w-72"
                                value={values[need.name] ?? ""}
                                onChange={(event) => onChange(need.name, event.target.value)}
                                disabled={disabled}
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>
                    ))}
                </>
            ) : null}
            {willDo.length > 0 ? (
                <details className={needs.length > 0 ? "border-t" : ""}>
                    <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2.5 text-sm text-foreground">What Opslin sets up for you</summary>
                    <ul className="space-y-1 px-4 pb-3 text-xs text-muted-foreground">
                        {willDo.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                </details>
            ) : null}
        </div>
    );
}
