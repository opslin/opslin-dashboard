"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Panel, Section } from "@/components/media/media-rows";
import { CheckRow as Row } from "./rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SecurityCheckTarget } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { gradeClass } from "./format";
import { errorMessage, isActiveScan, useSecurityCheckActions } from "./use-security-check";

function targetState(target: SecurityCheckTarget): string {
    const scan = target.latest;
    if (isActiveScan(scan)) return "Checking now";
    if (scan?.status === "COMPLETED") {
        const when = scan.completedAt ? formatRelativeTime(scan.completedAt) : "";
        return scan.graded && scan.grade ? `Grade ${scan.grade} · ${when}` : `Incomplete · ${when}`;
    }
    if (scan?.status === "FAILED") return "Last check didn't finish";
    return target.verified ? "Verified · not checked yet" : "Needs verification";
}

/** Step 1: paste a domain, or open one you already added. */
export function DomainStep({ targets, onOpen }: { targets: SecurityCheckTarget[]; onOpen: (id: string) => void }) {
    const { addDomain } = useSecurityCheckActions();
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        try {
            const { target } = await addDomain.mutateAsync(value.trim());
            setValue("");
            onOpen(target.id);
        } catch (e) {
            setError(errorMessage(e, "Couldn't add that domain."));
        }
    };

    return (
        <Panel>
            <Section label="Check a domain">
                <form onSubmit={submit} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <label htmlFor="security-check-domain" className="sr-only">
                        Domain
                    </label>
                    <Input
                        id="security-check-domain"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder="example.com"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        inputMode="url"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? "security-check-domain-error" : undefined}
                        className="min-w-0 flex-1 basis-56"
                    />
                    <Button type="submit" disabled={addDomain.isPending || value.trim() === ""}>
                        {addDomain.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                        Continue
                    </Button>
                </form>
                {error ? (
                    <p id="security-check-domain-error" role="alert" className="px-5 pb-3 text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
            </Section>
            {targets.length > 0 ? (
                <Section label="Your domains">
                    {targets.map((target) => (
                        <Row
                            key={target.id}
                            label={target.hostname}
                            state={<span className={target.latest?.graded ? gradeClass(target.latest.grade) : undefined}>{targetState(target)}</span>}
                            action={
                                <Button variant="ghost" size="sm" onClick={() => onOpen(target.id)} aria-label={`Open ${target.hostname}`}>
                                    Open
                                </Button>
                            }
                        />
                    ))}
                </Section>
            ) : null}
        </Panel>
    );
}
